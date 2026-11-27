import { useState, useEffect } from 'react';
import './App.css';

const orderStatuses = {
  OPEN: 'Aberta',
  PARTIALLY_FILLED: 'Parcialmente executada',
  FILLED: 'Executada',
  CANCELLED: 'Cancelada',
};

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function newerState(current, incoming) {
  return current?.revision > incoming.revision ? current : incoming;
}

async function api(path, token, body, { key, signal } = {}) {
  const response = await fetch(`/api${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(key ? { 'Idempotency-Key': key } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal,
  });
  const data = await response.json();
  if (!response.ok) {
    const detail = typeof data.detail === 'string' ? data.detail : 'Confira os campos informados.';
    const error = new Error(detail);
    error.status = response.status;
    throw error;
  }
  return data;
}

function App() {
  const [token, setToken] = useState('');
  const [username, setUsername] = useState('');
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pendingOrder, setPendingOrder] = useState(null);
  const [error, setError] = useState('');
  const [syncError, setSyncError] = useState('');
  const [connection, setConnection] = useState('connecting');
  const isLoggedIn = Boolean(token && state);
  const saldo = Number(state?.available_balance ?? state?.balance ?? 0);
  const carteira = state?.positions ?? {};
  const ativos = (state?.assets ?? []).map(asset => ({
    ticker: asset.ticker, nome: asset.name, preco: Number(asset.price),
    precoAbertura: Number(asset.opening_price), historico: asset.history.map(Number),
    volume: asset.volume,
  }));
  const ordens = state?.orders ?? [];
  const patrimonioTotal = Number(state?.equity ?? 0);
  const [tickerSelecionado, setTickerSelecionado] = useState('PETR4');
  const [lado, setLado] = useState('BUY');
  const [quantidade, setQuantidade] = useState('');
  const [preco, setPreco] = useState('38.50');
  const book = state?.books?.[tickerSelecionado];
  const retryableOrder = pendingOrder?.token === token ? pendingOrder : null;

  // Tempo real: o servidor avisa por WebSocket quando algo muda.
  // Se a conexão cair, tenta reconectar a cada 2 s e, ao voltar, busca o
  // estado completo via REST, porque eventos perdidos na queda não são reenviados.
  useEffect(() => {
    if (!token) return;
    let socket;
    let retryTimer;
    let closedByUser = false;

    const resync = async () => {
      try {
        const incoming = await api('/state', token);
        if (closedByUser) return;
        setState(current => newerState(current, incoming));
        setSyncError('');
      } catch (err) {
        if (!closedByUser) setSyncError(err.message);
      }
    };

    const applyPrice = ({ ticker, price, change_percent }) => {
      setState(current => {
        if (!current) return current;
        const assets = current.assets.map(asset => asset.ticker !== ticker ? asset : {
          ...asset, price, change_percent, history: [...asset.history, price].slice(-15),
        });
        const equity = Number(current.balance) + assets.reduce(
          (total, asset) => total + Number(asset.price) * (current.positions[asset.ticker] ?? 0), 0);
        return { ...current, assets, equity };
      });
    };

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      socket = new WebSocket(`${protocol}://${window.location.host}/api/ws?token=${encodeURIComponent(token)}`);

      socket.onopen = () => {
        setConnection('online');
        resync();
      };

      socket.onmessage = (message) => {
        const event = JSON.parse(message.data);
        if (event.type === 'PRICE_UPDATED') applyPrice(event.data);
        // Ordens podem vir de outra aba do mesmo usuário: atualiza saldo e carteira.
        if (['ORDER_ACCEPTED', 'ORDER_REJECTED', 'BOOK_UPDATED'].includes(event.type)) resync();
      };

      socket.onclose = (event) => {
        if (closedByUser) return;
        if (event.code === 1008) {
          closedByUser = true;
          // Sessão não existe mais no servidor (ex.: reiniciado): volta ao login.
          setToken('');
          setState(null);
          setConnection('connecting');
          setError('Sua sessão expirou porque o servidor foi reiniciado. Entre novamente.');
          return;
        }
        setConnection('reconnecting');
        retryTimer = setTimeout(connect, 2000);
      };
    };

    connect();
    return () => {
      closedByUser = true;
      clearTimeout(retryTimer);
      socket?.close();
    };
  }, [token]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const session = await api('/demo/sessions', '', { username: username.trim() });
      const initial = await api('/state', session.access_token);
      setState(initial);
      setPendingOrder(null);
      setSyncError('');
      setToken(session.access_token);
      const asset = initial.assets.find(a => a.ticker === tickerSelecionado);
      if (asset) setPreco(Number(asset.price).toFixed(2));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleEnviarOrdem = async (e) => {
    e.preventDefault();
    if (busy || retryableOrder) return;
    const quantity = Number(quantidade);
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 1000000
        || !/^\d+(\.\d{1,2})?$/.test(preco) || Number(preco) <= 0) {
      setError('Informe quantidade inteira positiva (até 1.000.000) e preço positivo com até duas casas decimais.');
      return;
    }
    const command = { ticker: tickerSelecionado, side: lado, quantity, price: preco };
    const key = book ? Array.from(crypto.getRandomValues(new Uint8Array(16)),
      byte => byte.toString(16).padStart(2, '0')).join('') : undefined;
    await submitOrder({ command, key, token });
  };

  const submitOrder = async (submission) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await api('/orders', submission.token, submission.command, {
        key: submission.key,
        signal: AbortSignal.timeout(10000),
      });
      if (!result?.order || !result.state) throw new Error('Resposta incompleta.');
      setState(current => newerState(current, result.state));
      setPendingOrder(null);
      setQuantidade('');
    } catch (err) {
      const rejected = [400, 401, 403, 409, 422].includes(err.status);
      if (!rejected && submission.key) {
        setPendingOrder(submission);
      } else {
        setPendingOrder(null);
        setError(rejected ? err.message : 'Não foi possível confirmar o envio. Consulte o histórico antes de repetir.');
      }
    } finally {
      setBusy(false);
    }
  };

  const cancelOrder = async (orderId) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await api(`/orders/${encodeURIComponent(orderId)}/cancel`, token, {});
      setState(current => newerState(current, result.state));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Tela de Login
  if (!isLoggedIn) {
    return (
      <div className="login-page">
        <form onSubmit={handleLogin} className="login-card">
          <div className="login-brand">
            <h1 className="login-title">📈 SD Investimentos</h1>
            <p className="login-subtitle">Simulador de bolsa multiplayer</p>
          </div>

          <label htmlFor="login-username" className="login-label">Nome de investidor</label>
          <input
            id="login-username"
            className="login-input"
            type="text"
            required
            maxLength={60}
            autoFocus
            autoComplete="username"
            disabled={busy}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Ex.: Filipe"
          />

          {error && <p role="alert" className="login-error">{error}</p>}

          <button type="submit" disabled={busy || !username.trim()} className="login-button">
            {busy ? 'Conectando...' : 'Entrar no mercado'}
          </button>

          <p className="login-hint">
            Modo demonstração: entre só com um nome. Saldo inicial de R$ 1.000,00.
          </p>
        </form>
      </div>
    );
  }

  // Tela do Home Broker
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9', fontFamily: 'Arial, sans-serif' }}>
      
      {/* Navbar */}
      <nav style={{ backgroundColor: '#0f172a', padding: '15px 30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'white' }}>
        <h2 style={{ margin: 0, fontSize: '20px', letterSpacing: '1px' }}>📈 SD Investimentos</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <span style={{ fontSize: '14px', color: '#94a3b8' }}>Investidor: <strong>{username}</strong></span>
          <button disabled={busy} onClick={() => { setToken(''); setState(null); setError(''); setConnection('connecting'); }} style={{ padding: '8px 16px', backgroundColor: 'transparent', color: '#ef4444', border: '1px solid #ef4444', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Sair</button>
        </div>
      </nav>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '30px 20px' }}>
        <p className="demo-note">
          <span>{book ? 'Negociação entre investidores' : 'Execução imediata simulada'}</span>
          <span>{book ? 'Cotação pelo último negócio' : 'Cotações compartilhadas, a cada 3 segundos'}</span>
        </p>
        {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
        {syncError && <p role="alert" style={{ color: '#b91c1c' }}>Falha na atualização: {syncError}</p>}
        {retryableOrder && (
          <div role="alert">
            <p>O resultado do envio é incerto. Você pode reenviar a mesma ordem sem duplicá-la nesta sessão.</p>
            <button type="button" disabled={busy} onClick={() => submitOrder(retryableOrder)}>
              Reenviar a mesma ordem
            </button>
          </div>
        )}
        
        {/* Painel Superior */}
        <div style={{ display: 'flex', gap: '20px', marginBottom: '30px', flexWrap: 'wrap' }}>
          
          <div style={{ backgroundColor: '#ffffff', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', flex: 1, minWidth: '250px', borderLeft: '5px solid #10b981' }}>
            <p style={{ margin: '0 0 5px 0', color: '#64748b', fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase' }}>Saldo Disponível</p>
            <h1 style={{ margin: 0, color: '#0f172a', fontSize: '28px' }}>R$ {saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h1>
          </div>
          
          <div style={{ backgroundColor: '#ffffff', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', flex: 1, minWidth: '250px', borderLeft: '5px solid #3b82f6' }}>
            <p style={{ margin: '0 0 5px 0', color: '#64748b', fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase' }}>Patrimônio Total</p>
            <h1 style={{ margin: 0, color: '#0f172a', fontSize: '28px' }}>R$ {patrimonioTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h1>
          </div>

          <div style={{ backgroundColor: '#ffffff', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', flex: 1, minWidth: '250px', borderLeft: '5px solid #8b5cf6' }}>
            <p style={{ margin: '0 0 5px 0', color: '#64748b', fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase' }}>Minha Carteira</p>
            <div style={{ margin: 0, color: '#0f172a', fontSize: '16px', display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '10px' }}>
              {Object.entries(carteira).map(([ticker, qtd]) => (
                <span key={ticker} style={{ backgroundColor: '#f3e8ff', color: '#6b21a8', padding: '4px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                  {ticker}: {qtd}
                  {state.portfolio?.[ticker]?.average_price != null && (
                    <small style={{ display: 'block' }}>
                      Médio {money.format(state.portfolio[ticker].average_price)}
                      {' · '}P/L não realizado {money.format(state.portfolio[ticker].unrealized_profit)}
                    </small>
                  )}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 430px), 1fr))', gap: '20px' }}>
          
          {/* Coluna Esquerda: Tabela de Ativos com Gráfico */}
          <div style={{ backgroundColor: '#ffffff', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', overflowX: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, color: '#0f172a' }}>Mercado ao Vivo</h3>
              <span style={{ fontSize: '12px', backgroundColor: connection === 'online' ? '#dcfce7' : '#fef3c7', color: connection === 'online' ? '#166534' : '#92400e', padding: '4px 8px', borderRadius: '12px', fontWeight: 'bold' }}>{connection === 'online' ? '● Tempo real' : connection === 'reconnecting' ? '● Reconectando...' : '● Conectando...'}</span>
            </div>
            
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #f1f5f9', color: '#64748b', fontSize: '14px', textAlign: 'left' }}>
                  <th style={{ padding: '12px 8px' }}>Ativo</th>
                  <th style={{ padding: '12px 8px' }}>Preço Atual</th>
                  <th style={{ padding: '12px 8px' }}>Variação</th>
                  {book && <th style={{ padding: '12px 8px' }}>Volume</th>}
                  <th style={{ padding: '12px 8px' }}>Tendência</th>
                </tr>
              </thead>
              <tbody>
                {ativos.map(a => {
                  // Cálculo Real da Variação em relação ao Preço de Abertura
                  const variacaoPercentual = ((a.preco - a.precoAbertura) / a.precoAbertura) * 100;
                  const isUp = variacaoPercentual >= 0;
                  
                  // Normalização para o gráfico CSS
                  const max = Math.max(...a.historico);
                  const min = Math.min(...a.historico);
                  const range = max - min || 1;

                  return (
                    <tr key={a.ticker} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '16px 8px' }}>
                        <strong style={{ display: 'block', color: '#0f172a', fontSize: '16px' }}>{a.ticker}</strong>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>{a.nome}</span>
                      </td>
                      <td style={{ padding: '16px 8px', fontWeight: 'bold', color: '#0f172a' }}>R$ {a.preco.toFixed(2)}</td>
                      <td style={{ padding: '16px 8px', fontWeight: 'bold', color: isUp ? '#10b981' : '#ef4444' }}>
                        {isUp ? '▲' : '▼'} {Math.abs(variacaoPercentual).toFixed(2)}%
                      </td>
                      {book && <td style={{ padding: '16px 8px' }}>{a.volume?.toLocaleString('pt-BR') ?? '—'}</td>}
                      
                      {/* Mini Gráfico de Barras */}
                      <td style={{ padding: '16px 8px' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-end', height: '25px', gap: '2px' }}>
                          {a.historico.map((preco, index) => {
                            const alturaPorcentagem = ((preco - min) / range) * 100;
                            const cor = index > 0 && preco >= a.historico[index - 1] ? '#10b981' : '#ef4444';
                            
                            return (
                              <div 
                                key={index} 
                                style={{ 
                                  width: '6px', 
                                  height: `${Math.max(15, alturaPorcentagem)}%`, 
                                  backgroundColor: cor,
                                  borderRadius: '2px 2px 0 0',
                                  transition: 'height 0.3s ease'
                                }} 
                              />
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Coluna Direita: Formulário de Ordem */}
          <div style={{ backgroundColor: '#ffffff', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 20px 0', color: '#0f172a' }}>Enviar Ordem</h3>
            <form onSubmit={handleEnviarOrdem} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '13px', color: '#64748b', marginBottom: '5px', fontWeight: 'bold' }}>Ativo</label>
                  <select disabled={busy} value={tickerSelecionado} onChange={e => { setTickerSelecionado(e.target.value); setPreco(ativos.find(a => a.ticker === e.target.value).preco.toFixed(2)); }} style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '15px' }}>
                    {ativos.map(a => <option key={a.ticker} value={a.ticker}>{a.ticker} - {a.nome}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '13px', color: '#64748b', marginBottom: '5px', fontWeight: 'bold' }}>Operação</label>
                  <select disabled={busy} value={lado} onChange={e => setLado(e.target.value)} style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '15px', fontWeight: 'bold', color: lado === 'BUY' ? '#10b981' : '#ef4444' }}>
                    <option value="BUY">COMPRA</option>
                    <option value="SELL">VENDA</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '13px', color: '#64748b', marginBottom: '5px', fontWeight: 'bold' }}>Quantidade</label>
                  <input type="number" required min="1" max="1000000" step="1" disabled={busy} placeholder="Ex: 100" value={quantidade} onChange={e => setQuantidade(e.target.value)} style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '15px' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '13px', color: '#64748b', marginBottom: '5px', fontWeight: 'bold' }}>Preço (R$)</label>
                  <input type="number" required min="0.01" max="9999999999.99" disabled={busy} step="0.01" placeholder="Ex: 38.50" value={preco} onChange={e => setPreco(e.target.value)} style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '15px' }} />
                </div>
              </div>

              <button type="submit" disabled={busy || Boolean(retryableOrder)} style={{ padding: '14px', backgroundColor: lado === 'BUY' ? '#10b981' : '#ef4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px', marginTop: '10px', transition: '0.2s' }}>
                {lado === 'BUY' ? 'Enviar Ordem de Compra' : 'Enviar Ordem de Venda'}
              </button>
            </form>
          </div>
        </div>

        {book && (
          <section>
            <h3>Livro de ofertas — {tickerSelecionado}</h3>
            <p>Ações disponíveis para venda: {state.available_positions[tickerSelecionado]}</p>
            {[['Compras', book.buy_orders], ['Vendas', book.sell_orders]].map(([label, levels]) => (
              <div key={label}>
                <h4>{label}</h4>
                {levels.length ? (
                  <ul>
                    {levels.map(level => <li key={level.price}>{level.quantity} × R$ {Number(level.price).toFixed(2)}</li>)}
                  </ul>
                ) : <p>Sem ofertas.</p>}
              </div>
            ))}
          </section>
        )}

        {/* Tabela de Ordens (Parte Inferior) */}
        <div style={{ backgroundColor: '#ffffff', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', marginTop: '20px', overflowX: 'auto' }}>
          <h3 style={{ margin: '0 0 20px 0', color: '#0f172a' }}>Histórico de Ordens</h3>
          {ordens.length === 0 ? (
            <p style={{ color: '#94a3b8', textAlign: 'center', padding: '20px' }}>Nenhuma ordem enviada até o momento.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #f1f5f9', color: '#64748b', fontSize: '14px', textAlign: 'left' }}>
                  <th style={{ padding: '12px 8px' }}>ID</th>
                  <th style={{ padding: '12px 8px' }}>Data/Hora</th>
                  <th style={{ padding: '12px 8px' }}>Ativo</th>
                  <th style={{ padding: '12px 8px' }}>Operação</th>
                  <th style={{ padding: '12px 8px' }}>Solicitada</th>
                  <th style={{ padding: '12px 8px' }}>Executada</th>
                  <th style={{ padding: '12px 8px' }}>Restante</th>
                  <th style={{ padding: '12px 8px' }}>Preço</th>
                  <th style={{ padding: '12px 8px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {ordens.map(o => (
                  <tr key={o.order_id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '16px 8px', color: '#64748b' }}>#{o.order_id.slice(0, 8)}</td>
                    <td style={{ padding: '16px 8px', color: '#64748b' }}>{new Date(o.created_at).toLocaleString('pt-BR')}</td>
                    <td style={{ padding: '16px 8px', fontWeight: 'bold' }}>{o.ticker}</td>
                    <td style={{ padding: '16px 8px' }}>
                      <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', backgroundColor: o.side === 'BUY' ? '#dcfce7' : '#fee2e2', color: o.side === 'BUY' ? '#166534' : '#991b1b' }}>
                        {o.side === 'BUY' ? 'COMPRA' : 'VENDA'}
                      </span>
                    </td>
                    <td style={{ padding: '16px 8px' }}>{o.quantity}</td>
                    <td style={{ padding: '16px 8px' }}>{o.quantity - (o.remaining_quantity ?? 0) - (o.cancelled_quantity ?? 0)}</td>
                    <td style={{ padding: '16px 8px' }}>{o.remaining_quantity ?? 0}</td>
                    <td style={{ padding: '16px 8px', fontWeight: 'bold' }}>R$ {Number(o.price).toFixed(2)}</td>
                    <td style={{ padding: '16px 8px' }}>
                      <span style={{ fontWeight: 'bold', fontSize: '13px' }}>{orderStatuses[o.status] ?? o.status}</span>
                      {o.remaining_quantity > 0 && (
                        <div>
                          <button type="button" disabled={busy} onClick={() => cancelOrder(o.order_id)}>Cancelar</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {state.trades && (
          <section>
            <h3>Minhas negociações</h3>
            {state.trades.length ? (
              <ul>
                {state.trades.map(trade => (
                  <li key={trade.trade_id}>
                    {new Date(trade.created_at).toLocaleString('pt-BR')} · {trade.ticker} · {trade.quantity} × R$ {Number(trade.price).toFixed(2)}
                  </li>
                ))}
              </ul>
            ) : <p>Nenhuma negociação realizada.</p>}
          </section>
        )}
      </div>
    </div>
  );
}

export default App;
