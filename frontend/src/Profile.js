import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from './api';
import './Profile.css';

const Profile = () => {
  const [user, setUser] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({ username: '', email: '', phone: '' });
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const fetchProfile = async (userId) => {
    try {
      const response = await api.get(`/api/profile/${userId}`);
      setUser(response.data);
      setFormData({
        username: response.data.username,
        email: response.data.email,
        phone: response.data.phone || '',
      });
    } catch (error) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        localStorage.clear();
        navigate('/login');
      }
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    const userData = JSON.parse(localStorage.getItem('user') || '{}');
    if (userData?.id) fetchProfile(userData.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!user) return;

    try {
      await api.put(`/api/profile/${user.id}`, formData);
      setMessage('Profile updated.');
      setEditMode(false);
      const updatedUser = { ...user, ...formData };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      fetchProfile(user.id);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Update failed.');
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/login');
  };

  if (!user) {
    return <div className="profile-container"><p>Loading...</p></div>;
  }

  return (
    <div className="profile-container">
      <div className="profile-card">
        <div className="profile-header">
          <h2>Profile</h2>
          <button className="back-btn" onClick={() => navigate('/dashboard')}>Back</button>
        </div>

        <div className="profile-avatar">
          <div className="avatar-circle">{user.username.charAt(0).toUpperCase()}</div>
        </div>

        {editMode ? (
          <form onSubmit={handleUpdate} className="profile-form">
            <div className="form-group">
              <label>Username</label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Phone</label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
            <div className="form-actions">
              <button type="submit">Save</button>
              <button type="button" onClick={() => setEditMode(false)}>Cancel</button>
            </div>
          </form>
        ) : (
          <div className="profile-info">
            <div className="info-item">
              <span className="info-label">Username</span>
              <span className="info-value">{user.username}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Email</span>
              <span className="info-value">{user.email}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Phone</span>
              <span className="info-value">{user.phone || '-'}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Joined</span>
              <span className="info-value">{new Date(user.created_at).toLocaleDateString('ko-KR')}</span>
            </div>
            <button className="edit-profile-btn" onClick={() => setEditMode(true)}>Edit Profile</button>
          </div>
        )}

        {message && <p className="message">{message}</p>}

        <button className="logout-btn-full" onClick={handleLogout}>Logout</button>
      </div>
    </div>
  );
};

export default Profile;
