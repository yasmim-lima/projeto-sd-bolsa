import { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Estados do Mercado (Adicionado 'precoAbertura' e corrigido a variação)
  const [saldo, setSaldo] = useState(1000.00);
  const [carteira, setCarteira] = useState({ PETR4: 0, VALE3: 0, ITUB4: 0 });
  
  const [ativos, setAtivos] = useState([
    { ticker: 'PETR4', nome: 'Petrobras', preco: 38.50, precoAbertura: 38.50, historico: [38.40, 38.45, 38.50] },
    { ticker: 'VALE3', nome: 'Vale', preco: 65.20, precoAbertura: 65.20, historico: [65.50, 65.30, 65.20] },
    { ticker: 'ITUB4', nome: 'Itaú', preco: 32.10, precoAbertura: 32.10, historico: [31.90, 32.00, 32.10] },
  ]);
  const [ordens, setOrdens] = useState([]);

  // Estados do Formulário
  const [tickerSelecionado, setTickerSelecionado] = useState('PETR4');
  const [lado, setLado] = useState('BUY');
  const [quantidade, setQuantidade] = useState('');
  const [preco, setPreco] = useState('');

  // Preenche o preço automaticamente quando muda o ativo
  useEffect(() => {
    const ativoAtual = ativos.find(a => a.ticker === tickerSelecionado);
    if (ativoAtual) {
      setPreco(ativoAtual.preco.toFixed(2));
    }
  }, [tickerSelecionado, ativos]);

  // Efeito para simular o mercado oscilando e guardar histórico
  useEffect(() => {
    let interval;
    if (isLoggedIn) {
      interval = setInterval(() => {
        setAtivos(prevAtivos => 
          prevAtivos.map(ativo => {
            const mudanca = (Math.random() - 0.5) * 0.5; 
            const novoPreco = Math.max(1, ativo.preco + mudanca);
            
            // Mantém apenas os últimos 15 preços para o mini-gráfico
            const novoHistorico = [...ativo.historico, novoPreco].slice(-15);
            
            return { 
              ...ativo, 
              preco: novoPreco,
              historico: novoHistorico
            };
          })
        );
      }, 3000); 
    }
    return () => clearInterval(interval);
  }, [isLoggedIn]);

  const handleLogin = (e) => {
    e.preventDefault();
    if (username && password) {
      setIsLoggedIn(true);
    } else {
      alert("Preencha usuário e senha!");
    }
  };

  const handleEnviarOrdem = (e) => {
    e.preventDefault();
    const qtd = parseInt(quantidade);
    const prc = parseFloat(preco);
    
    if (!qtd || qtd <= 0 || !prc || prc <= 0) {
      alert("A quantidade e o preço devem ser maiores que zero!");
      return;
    }

    const valorTotal = qtd * prc;

    // 1. VALIDAÇÃO DE SALDO (Se for compra)
    if (lado === 'BUY' && valorTotal > saldo) {
      alert("Saldo insuficiente para esta compra!");
      return;
    }

    // 2. VALIDAÇÃO DE CARTEIRA (Se for venda)
    const qtdAtualNaCarteira = carteira[tickerSelecionado] || 0;
    if (lado === 'SELL' && qtd > qtdAtualNaCarteira) {
      alert(`Você não possui ${qtd} ações de ${tickerSelecionado} para vender. Você tem apenas ${qtdAtualNaCarteira}.`);
      return;
    }

    // Simulação de Matching Engine
    const novaOrdem = {
      id: Math.floor(Math.random() * 10000),
      ticker: tickerSelecionado,
      lado,
      quantidade: qtd,
      preco: prc,
      status: 'EXECUTADA'
    };

    setOrdens([novaOrdem, ...ordens]);

    // Atualiza saldo e carteira
    if (lado === 'BUY') {
      setSaldo(saldo - valorTotal);
      setCarteira({ 
        ...carteira, 
        [tickerSelecionado]: qtdAtualNaCarteira + qtd 
      });
    } else {
      setSaldo(saldo + valorTotal);
      setCarteira({ 
        ...carteira, 
        [tickerSelecionado]: qtdAtualNaCarteira - qtd 
      });
    }

    setQuantidade('');
  };

  // Cálculo do Patrimônio
  const valorCarteira = Object.entries(carteira).reduce((total, [ticker, qtd]) => {
    const ativo = ativos.find(a => a.ticker === ticker);
    return total + (ativo ? ativo.preco * qtd : 0);
  }, 0);
  
  const patrimonioTotal = ordens.length === 0 ? 0 : (saldo + valorCarteira);

  // Tela de Login
  if (!isLoggedIn) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#1e293b' }}>
        <form onSubmit={handleLogin} style={{ backgroundColor: '#ffffff', padding: '40px', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', width: '350px' }}>
          <h1 style={{ textAlign: 'center', marginBottom: '30px', color: '#0f172a', fontSize: '24px' }}>📈 SD Investimentos</h1>
          
          <label style={{ marginBottom: '8px', color: '#475569', fontWeight: 'bold', fontSize: '14px' }}>Usuário</label>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} style={{ padding: '12px', marginBottom: '20px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '16px' }} placeholder="Digite seu usuário" />
          
          <label style={{ marginBottom: '8px', color: '#475569', fontWeight: 'bold', fontSize: '14px' }}>Senha</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ padding: '12px', marginBottom: '30px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '16px' }} placeholder="••••••••" />
          
          <button type="submit" style={{ padding: '14px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px', transition: '0.2s' }}>Acessar Plataforma</button>
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
          <button onClick={() => setIsLoggedIn(false)} style={{ padding: '8px 16px', backgroundColor: 'transparent', color: '#ef4444', border: '1px solid #ef4444', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Sair</button>
        </div>
      </nav>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '30px 20px' }}>
        
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
              <span style={{ fontSize: '12px', backgroundColor: '#dcfce7', color: '#166534', padding: '4px 8px', borderRadius: '12px', fontWeight: 'bold' }}>● Tempo Real</span>
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
                  <select value={tickerSelecionado} onChange={e => setTickerSelecionado(e.target.value)} style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '15px' }}>
                    {ativos.map(a => <option key={a.ticker} value={a.ticker}>{a.ticker} - {a.nome}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '13px', color: '#64748b', marginBottom: '5px', fontWeight: 'bold' }}>Operação</label>
                  <select value={lado} onChange={e => setLado(e.target.value)} style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '15px', fontWeight: 'bold', color: lado === 'BUY' ? '#10b981' : '#ef4444' }}>
                    <option value="BUY">COMPRA</option>
                    <option value="SELL">VENDA</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '13px', color: '#64748b', marginBottom: '5px', fontWeight: 'bold' }}>Quantidade</label>
                  <input type="number" placeholder="Ex: 100" value={quantidade} onChange={e => setQuantidade(e.target.value)} style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '15px' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '13px', color: '#64748b', marginBottom: '5px', fontWeight: 'bold' }}>Preço (R$)</label>
                  <input type="number" step="0.01" placeholder="Ex: 38.50" value={preco} onChange={e => setPreco(e.target.value)} style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '15px' }} />
                </div>
              </div>

              <button type="submit" style={{ padding: '14px', backgroundColor: lado === 'BUY' ? '#10b981' : '#ef4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px', marginTop: '10px', transition: '0.2s' }}>
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
                  <tr key={o.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '16px 8px', color: '#64748b' }}>#{o.id}</td>
                    <td style={{ padding: '16px 8px', color: '#64748b' }}>{new Date().toLocaleTimeString('pt-BR')}</td>
                    <td style={{ padding: '16px 8px', fontWeight: 'bold' }}>{o.ticker}</td>
                    <td style={{ padding: '16px 8px' }}>
                      <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', backgroundColor: o.lado === 'BUY' ? '#dcfce7' : '#fee2e2', color: o.lado === 'BUY' ? '#166534' : '#991b1b' }}>
                        {o.lado === 'BUY' ? 'COMPRA' : 'VENDA'}
                      </span>
                    </td>
                    <td style={{ padding: '16px 8px' }}>{o.quantidade}</td>
                    <td style={{ padding: '16px 8px', fontWeight: 'bold' }}>R$ {o.preco.toFixed(2)}</td>
                    <td style={{ padding: '16px 8px' }}>
                      <span style={{ color: '#10b981', fontWeight: 'bold', fontSize: '13px' }}>Executada</span>
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