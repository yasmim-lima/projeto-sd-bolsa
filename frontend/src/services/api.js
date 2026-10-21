import axios from 'axios';

// URL base do backend (FastAPI)
const api = axios.create({
  baseURL: 'http://localhost:8000', 
});

// Função preparada para a Parte 2 (Integração real)
export const enviarOrdem = async (ordem) => {
  // Quando o backend estiver 100%, basta descomentar a linha abaixo:
  // const response = await api.post('/orders', ordem);
  // return response.data;
  
  console.log("Ordem enviada para o backend (Mock):", ordem);
  return { status: 'OK' };
};