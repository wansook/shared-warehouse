import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import './Profile.css';

const Profile = () => {
  const [user, setUser] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({ username: '', email: '' });
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const token = localStorage.getItem('token');

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    const userData = JSON.parse(localStorage.getItem('user'));
    fetchProfile(userData.id);
  }, [token, navigate]);

  const api = axios.create({
    baseURL: 'http://localhost:3001',
    headers: { Authorization: `Bearer ${token}` }
  });

  const fetchProfile = async (userId) => {
    try {
      const response = await api.get(`/api/profile/${userId}`);
      setUser(response.data);
      setFormData({ username: response.data.username, email: response.data.email });
    } catch (error) {
      if (error.response && error.response.status === 403) {
        localStorage.clear();
        navigate('/login');
      }
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!user) return;

    try {
      await api.put(`/api/profile/${user.id}`, formData);
      setMessage('프로필이 수정되었습니다.');
      setEditMode(false);
      const updatedUser = { ...user, username: formData.username, email: formData.email };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      fetchProfile(user.id);
    } catch (error) {
      setMessage(error.response?.data?.message || '수정 실패');
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/login');
  };

  if (!user) {
    return <div className="profile-container"><p>로딩 중...</p></div>;
  }

  return (
    <div className="profile-container">
      <div className="profile-card">
        <div className="profile-header">
          <h2>👤 프로필</h2>
          <button className="back-btn" onClick={() => navigate('/dashboard')}>← 돌아가기</button>
        </div>

        <div className="profile-avatar">
          <div className="avatar-circle">{user.username.charAt(0).toUpperCase()}</div>
        </div>

        {editMode ? (
          <form onSubmit={handleUpdate} className="profile-form">
            <div className="form-group">
              <label>아이디</label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>이메일</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </div>
            <div className="form-actions">
              <button type="submit">저장</button>
              <button type="button" onClick={() => setEditMode(false)}>취소</button>
            </div>
          </form>
        ) : (
          <div className="profile-info">
            <div className="info-item">
              <span className="info-label">아이디</span>
              <span className="info-value">{user.username}</span>
            </div>
            <div className="info-item">
              <span className="info-label">이메일</span>
              <span className="info-value">{user.email}</span>
            </div>
            <div className="info-item">
              <span className="info-label">가입일</span>
              <span className="info-value">{new Date(user.created_at).toLocaleDateString('ko-KR')}</span>
            </div>
            <button className="edit-profile-btn" onClick={() => setEditMode(true)}>프로필 수정</button>
          </div>
        )}

        {message && <p className="message">{message}</p>}

        <button className="logout-btn-full" onClick={handleLogout}>로그아웃</button>
      </div>
    </div>
  );
};

export default Profile;
