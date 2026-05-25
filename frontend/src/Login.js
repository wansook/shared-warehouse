import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, LockKeyhole, Warehouse } from 'lucide-react';
import api from './api';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Input } from './components/ui/input';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage('');
    setIsLoading(true);

    try {
      const response = await api.post('/api/login', { username, password });
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      setMessage('로그인되었습니다. 대시보드로 이동합니다.');
      setTimeout(() => navigate('/dashboard'), 1000);
    } catch (error) {
      setMessage(error.response?.data?.message || '서버에 연결할 수 없습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(145deg,#0f766e_0%,#0d9488_48%,#f8fafc_100%)] px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3 rounded-lg bg-white/95 p-5 shadow-md">
          <div className="rounded-lg bg-primary p-3 text-primary-foreground">
            <Warehouse className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">공유 창고</h1>
            <p className="text-sm text-muted-foreground">운영 콘솔</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>로그인</CardTitle>
            <CardDescription>창고와 캐비넷을 관리하려면 로그인하세요.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="username" className="text-sm font-medium">사용자 이름</label>
                <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
              </div>
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium">비밀번호</label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                <LockKeyhole className="h-4 w-4" />
                {isLoading ? '로그인 중...' : '로그인'}
              </Button>
            </form>

            {message && <p className="mt-4 rounded-md border bg-muted p-3 text-center text-sm">{message}</p>}

            <p className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              계정이 없으신가요?
              <Link to="/register" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                회원가입 <ArrowRight className="h-3 w-3" />
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
};

export default Login;
