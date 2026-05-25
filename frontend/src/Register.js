import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, UserPlus, Warehouse } from 'lucide-react';
import api from './api';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Input } from './components/ui/input';

const Register = () => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage('');
    setIsLoading(true);

    try {
      const response = await api.post('/api/register', { username, email, password });
      setMessage(`${response.data.message}. Moving to login.`);
      setUsername('');
      setEmail('');
      setPassword('');
      setTimeout(() => navigate('/login'), 1500);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to connect to the server.');
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
            <h1 className="text-xl font-semibold">Shared Warehouse</h1>
            <p className="text-sm text-muted-foreground">Create account</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Register</CardTitle>
            <CardDescription>Create an account for warehouse access and operations.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="username" className="text-sm font-medium">Username</label>
                <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
              </div>
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">Email</label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
              </div>
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium">Password</label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength="6" required />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                <UserPlus className="h-4 w-4" />
                {isLoading ? 'Creating...' : 'Register'}
              </Button>
            </form>

            {message && <p className="mt-4 rounded-md border bg-muted p-3 text-center text-sm">{message}</p>}

            <p className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              Already have an account?
              <Link to="/login" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                <ArrowLeft className="h-3 w-3" /> Login
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
};

export default Register;
