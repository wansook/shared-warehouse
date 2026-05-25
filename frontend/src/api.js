import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const data = (request) => request.then((response) => response.data);

api.login = (username, password) => data(api.post('/api/login', { username, password }));
api.getWarehouses = () => data(api.get('/api/warehouses'));
api.getCabinets = (warehouseId) => data(api.get(`/api/warehouses/${warehouseId}/cabinets`));
api.getWarehouseLayout = (warehouseId) => data(api.get(`/api/warehouses/${warehouseId}/layout`));
api.saveWarehouseLayout = (warehouseId, layoutData) => data(api.put(`/api/warehouses/${warehouseId}/layout`, { layout_data: layoutData }));
api.saveCabinetLayout = (cabinetId, payload) => data(api.put(`/api/cabinets/${cabinetId}/layout`, payload));
api.saveCabinetName = (cabinetId, name) => data(api.put(`/api/cabinets/${cabinetId}`, { name }));
api.createContract = (payload) => data(api.post('/api/contracts', payload));
api.createMockPayment = (payload) =>
  data(api.post('/api/payments/mock', payload)).catch((error) => {
    if (error.response?.status === 404) return data(api.post('/api/payments', payload));
    throw error;
  });
api.openHardware = (payload) =>
  data(api.post('/api/hardware/open', payload)).catch((error) => {
    if (error.response?.status === 404 && payload?.pin) {
      return data(api.post('/api/access/emergency', {
        warehouse_id: payload.warehouse_id,
        pin: payload.pin,
        source: 'keypad',
      }));
    }
    throw error;
  });

export default api;
