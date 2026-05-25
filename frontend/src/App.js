import React from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Dashboard from './Dashboard';
import Login from './Login';
import Register from './Register';
import Profile from './Profile';
import LayoutEditor from './LayoutEditor';
import LoginPage from './LoginPage';
import DynamicLayoutViewer from './DynamicLayoutViewer';
import EmergencyKeyPad from './EmergencyKeyPad';
import './App.css';

const PrivateRoute = ({ children }) => {
  const location = useLocation();
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/customer-login" state={{ from: location }} replace />;
};

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/customer-login" element={<LoginPage />} />
          <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/profile" element={<PrivateRoute><Profile /></PrivateRoute>} />
          <Route path="/layout-editor" element={<PrivateRoute><LayoutEditor /></PrivateRoute>} />
          <Route path="/layout-viewer" element={<PrivateRoute><DynamicLayoutViewer /></PrivateRoute>} />
          <Route
            path="/emergency-keypad"
            element={(
              <EmergencyKeyPad
                onClose={() => window.history.back()}
                onVerified={() => window.history.back()}
              />
            )}
          />
          <Route path="/payment/success" element={<PrivateRoute><Dashboard paymentResult="success" /></PrivateRoute>} />
          <Route path="/payment/fail" element={<PrivateRoute><Dashboard paymentResult="fail" /></PrivateRoute>} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
