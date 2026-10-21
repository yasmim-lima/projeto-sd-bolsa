import { useState, useEffect } from 'react';
import './App.css';

async function api(path, token, body, signal) {
  const response = await fetch(`/api${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal,
  });
  const data = await response.json();
  if (!response.ok) {
    const detail = typeof data.detail === 'string' ? data.detail : 'Confira os campos informados.';
    throw new Error(detail);
  }
  return data;
}

function App() {
  const [token, setToken] = useState('');
  const [username, setUsername] = useState('');
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [syncError, setSyncError] = useState('');
  const isLoggedIn = Boolean(token && state);
  const saldo = Number(state?.balance ?? 0);
  const carteira = state?.positions ?? {};
  const ativos = (state?.assets ?? []).map(asset => ({
    ticker: asset.ticker, nome: asset.name, preco: Number(asset.price),
    precoAbertura: Number(asset.opening_price), historico: asset.history.map(Number),
  }));
  const ordens = state?.orders ?? [];
  const patrimonioTotal = Number(state?.equity ?? 0);
  const [tickerSelecionado, setTickerSelecionado] = useState('PETR4');
  const [lado, setLado] = useState('BUY');
  const [quantidade, setQuantidade] = useState('');
  const [preco, setPreco] = useState('38.50');

  // Polling temporário: os eventos WebSocket serão integrados com a parte de tempo real.
  useEffect(() => {
    if (!token || busy) return;
    const controller = new AbortController();
    let timer;
    const refresh = async () => {
      try {
        const next = await api('/state', token, undefined, controller.signal);
        if (!controller.signal.aborted) {
          setState(next);
          setSyncError('');
        }
      } catch (err) {
        if (!controller.signal.aborted) setSyncError(err.message);
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refresh, 3000);
      }
    };
    timer = setTimeout(refresh, 3000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [token, busy]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const session = await api('/demo/sessions', '', { username: username.trim() });
      const initial = await api('/state', session.access_token);
      setState(initial);
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
    if (busy) return;
    const quantity = Number(quantidade);
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 1000000
        || !/^\d+(\.\d{1,2})?$/.test(preco) || Number(preco) <= 0) {
      setError('Informe quantidade inteira positiva (até 1.000.000) e preço positivo com até duas casas decimais.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await api('/orders', token, {
        ticker: tickerSelecionado, side: lado, quantity, price: preco,
      });
      setState(result.state);
      setQuantidade('');
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
          <button disabled={busy} onClick={() => { setToken(''); setState(null); setError(''); }} style={{ padding: '8px 16px', backgroundColor: 'transparent', color: '#ef4444', border: '1px solid #ef4444', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Sair</button>
        </div>
      </nav>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '30px 20px' }}>
        <p>Demonstração: execução imediata simulada. Cotações compartilhadas, atualizadas a cada 3 segundos.</p>
        {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
        {syncError && <p role="alert" style={{ color: '#b91c1c' }}>Falha na atualização: {syncError}</p>}
        
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
                </span>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          
          {/* Coluna Esquerda: Tabela de Ativos com Gráfico */}
          <div style={{ backgroundColor: '#ffffff', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, color: '#0f172a' }}>Mercado ao Vivo</h3>
              <span style={{ fontSize: '12px', backgroundColor: '#dcfce7', color: '#166534', padding: '4px 8px', borderRadius: '12px', fontWeight: 'bold' }}>{syncError ? '● Sem atualização' : '● Atualização a cada 3s'}</span>
            </div>
            
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #f1f5f9', color: '#64748b', fontSize: '14px', textAlign: 'left' }}>
                  <th style={{ padding: '12px 8px' }}>Ativo</th>
                  <th style={{ padding: '12px 8px' }}>Preço Atual</th>
                  <th style={{ padding: '12px 8px' }}>Variação</th>
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

              <button type="submit" disabled={busy} style={{ padding: '14px', backgroundColor: lado === 'BUY' ? '#10b981' : '#ef4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px', marginTop: '10px', transition: '0.2s' }}>
                {lado === 'BUY' ? 'Enviar Ordem de Compra' : 'Enviar Ordem de Venda'}
              </button>
            </form>
          </div>
        </div>

        {/* Tabela de Ordens (Parte Inferior) */}
        <div style={{ backgroundColor: '#ffffff', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', marginTop: '20px' }}>
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
                  <th style={{ padding: '12px 8px' }}>Qtd</th>
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
                    <td style={{ padding: '16px 8px', fontWeight: 'bold' }}>R$ {Number(o.price).toFixed(2)}</td>
                    <td style={{ padding: '16px 8px' }}>
                      <span style={{ color: '#10b981', fontWeight: 'bold', fontSize: '13px' }}>{o.status === 'FILLED' ? 'Executada' : o.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>
  );
}

export default App;
