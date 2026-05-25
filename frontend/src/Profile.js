import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, LogOut, Mail, Pencil, Phone, Save, UserRound } from 'lucide-react';
import api from './api';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Input } from './components/ui/input';

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
        navigate('/customer-login');
      }
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/customer-login');
      return;
    }

    const userData = JSON.parse(localStorage.getItem('user') || '{}');
    if (userData?.id) fetchProfile(userData.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const handleUpdate = async (event) => {
    event.preventDefault();
    if (!user) return;

    try {
      await api.put(`/api/profile/${user.id}`, formData);
      setMessage('프로필이 업데이트되었습니다.');
      setEditMode(false);
      const updatedUser = { ...user, ...formData };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      fetchProfile(user.id);
    } catch (error) {
      setMessage(error.response?.data?.message || '프로필 업데이트에 실패했습니다.');
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/customer-login');
  };

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Card className="w-full max-w-sm">
          <CardContent className="p-6 text-center text-sm text-muted-foreground">프로필 로딩 중...</CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <header className="teal-header">
        <div className="teal-header__inner flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">프로필</h1>
            <div className="breadcrumb mt-1"><span>대시보드</span><span>/</span><strong>계정</strong></div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-4 w-4" />
              뒤로
            </Button>
            <Button variant="ghost" className="hover:bg-white/15" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
              로그아웃
            </Button>
          </div>
        </div>
      </header>

      <div className="page-main max-w-3xl">
        <Card>
          <CardHeader className="border-b">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-2xl font-semibold text-primary-foreground">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <div>
                  <CardTitle>계정 정보</CardTitle>
                  <CardDescription>프로필과 연락처 정보를 관리하세요.</CardDescription>
                </div>
              </div>
              {!editMode && (
                <Button onClick={() => setEditMode(true)}>
                  <Pencil className="h-4 w-4" />
                  수정
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent className="p-6">
            {editMode ? (
              <form onSubmit={handleUpdate} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">사용자 이름</label>
                  <Input value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">이메일</label>
                  <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">전화번호</label>
                  <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button type="submit">
                    <Save className="h-4 w-4" />
                    저장
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setEditMode(false)}>취소</Button>
                </div>
              </form>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border bg-white p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><UserRound className="h-4 w-4" />사용자 이름</div>
                  <p className="font-semibold">{user.username}</p>
                </div>
                <div className="rounded-lg border bg-white p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><Mail className="h-4 w-4" />이메일</div>
                  <p className="font-semibold">{user.email}</p>
                </div>
                <div className="rounded-lg border bg-white p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><Phone className="h-4 w-4" />전화번호</div>
                  <p className="font-semibold">{user.phone || '-'}</p>
                </div>
                <div className="rounded-lg border bg-white p-4">
                  <div className="mb-2 text-sm text-muted-foreground">생성일</div>
                  <p className="font-semibold">{new Date(user.created_at).toLocaleDateString('ko-KR')}</p>
                </div>
              </div>
            )}

            {message && <p className="mt-4 rounded-md border bg-muted p-3 text-sm">{message}</p>}
          </CardContent>
        </Card>
      </div>
    </main>
  );
};

export default Profile;
