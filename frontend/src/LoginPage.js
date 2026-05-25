import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Building2, KeyRound, LogIn, MessageSquareText, UserPlus } from 'lucide-react';
import api from './api';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';

const emptyLogin = { username: '', password: '' };
const emptyRegister = { username: '', email: '', password: '', phone: '', pin_code: '' };

function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const branchId = useMemo(() => new URLSearchParams(location.search).get('branch'), [location.search]);
  const redirectTo = location.state?.from?.pathname || '/dashboard';
  const [mode, setMode] = useState('login');
  const [loginForm, setLoginForm] = useState(emptyLogin);
  const [registerForm, setRegisterForm] = useState(emptyRegister);
  const [phoneForm, setPhoneForm] = useState({ phone: '', sms_code: '' });
  const [smsSent, setSmsSent] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const saveSession = (data) => {
    localStorage.setItem('token', data.token);
    if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
    navigate(redirectTo, { replace: true });
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const session = await api.login(loginForm.username, loginForm.password);
      saveSession(session);
    } catch (error) {
      setMessage(error.response?.data?.message || error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      await api.post('/api/register', registerForm);
      const session = await api.login(registerForm.username, registerForm.password);
      saveSession(session);
    } catch (error) {
      setMessage(error.response?.data?.message || error.message);
    } finally {
      setLoading(false);
    }
  };

  const sendSms = async () => {
    if (!phoneForm.phone) return;
    setLoading(true);
    setMessage('');
    try {
      await api.post('/api/auth/send-sms', { phone: phoneForm.phone });
      setSmsSent(true);
      setMessage('인증번호가 발송되었습니다.');
    } catch (error) {
      setMessage(error.response?.data?.message || error.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneLogin = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const response = await api.post('/api/login-phone', phoneForm);
      saveSession(response.data);
    } catch (error) {
      setMessage(error.response?.data?.message || error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(145deg,#0f766e_0%,#0d9488_46%,#ccfbf1_100%)] px-4 py-10">
      <div className="mx-auto max-w-md">
        <div className="mb-6 rounded-lg bg-white/95 p-5 text-center shadow-md">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Building2 className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-800">공유 창고</h1>
          {branchId && <p className="mt-1 text-sm text-muted-foreground">지점 #{branchId}</p>}
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2 rounded-lg border bg-card p-1 shadow-sm">
          <Button type="button" variant={mode === 'login' ? 'default' : 'ghost'} onClick={() => setMode('login')}><LogIn className="h-4 w-4" />로그인</Button>
          <Button type="button" variant={mode === 'phone' ? 'default' : 'ghost'} onClick={() => setMode('phone')}><MessageSquareText className="h-4 w-4" />SMS</Button>
          <Button type="button" variant={mode === 'register' ? 'default' : 'ghost'} onClick={() => setMode('register')}><UserPlus className="h-4 w-4" />회원가입</Button>
        </div>

        {message && <div className="mb-4 rounded-md border bg-card px-3 py-2 text-sm shadow-sm">{message}</div>}

        {mode === 'login' && (
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>고객 로그인</CardTitle>
              <CardDescription>계정 ID와 비밀번호로 로그인하세요.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={handleLogin}>
                <Input placeholder="사용자 이름" value={loginForm.username} onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })} required />
                <Input type="password" placeholder="비밀번호" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} required />
                <Button type="submit" className="w-full" disabled={loading}><KeyRound className="h-4 w-4" />로그인</Button>
              </form>
            </CardContent>
          </Card>
        )}

        {mode === 'phone' && (
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>전화번호 로그인</CardTitle>
              <CardDescription>기존 사용자는 로그인되고, 새로운 전화번호는 자동 생성됩니다.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={handlePhoneLogin}>
                <div className="flex gap-2">
                  <Input placeholder="010-1234-5678" value={phoneForm.phone} onChange={(e) => setPhoneForm({ ...phoneForm, phone: e.target.value })} required />
                  <Button type="button" variant="outline" onClick={sendSms} disabled={loading}>SMS 발송</Button>
                </div>
                <Input placeholder={smsSent ? '인증 번호' : '먼저 SMS 발송'} value={phoneForm.sms_code} onChange={(e) => setPhoneForm({ ...phoneForm, sms_code: e.target.value })} required />
                <Button type="submit" className="w-full" disabled={loading}>다음</Button>
              </form>
            </CardContent>
          </Card>
        )}

        {mode === 'register' && (
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>계정 만들기</CardTitle>
              <CardDescription>첫 번째로 가입하는 계정이 관리자가 됩니다.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={handleRegister}>
                <Input placeholder="사용자 이름" value={registerForm.username} onChange={(e) => setRegisterForm({ ...registerForm, username: e.target.value })} required />
                <Input type="email" placeholder="이메일" value={registerForm.email} onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })} required />
                <Input type="password" placeholder="비밀번호" value={registerForm.password} onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })} required />
                <Input placeholder="전화번호" value={registerForm.phone} onChange={(e) => setRegisterForm({ ...registerForm, phone: e.target.value })} />
                <Input placeholder="4자리 PIN" maxLength={4} value={registerForm.pin_code} onChange={(e) => setRegisterForm({ ...registerForm, pin_code: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
                <Button type="submit" className="w-full" disabled={loading}>계정 만들기</Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}

export default LoginPage;
