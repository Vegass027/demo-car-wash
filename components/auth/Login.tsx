import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { cn } from '../../lib/utils';
import { Lock } from 'lucide-react';
import { setSessionToken } from '../../lib/supabase';

interface LoginProps {
  onLogin: (userId: string, userRole: 'admin' | 'owner') => void;
  expiredMessage?: string; // shown above the form when session expired mid-session
}

// Error mapping per plan §1.6a table. Single source of truth — never expose
// server-side details (stack, RPC names) to the user. console.error keeps
// the details available for developer debugging.
const LOGIN_ERRORS: Record<number, string> = {
  400: 'Проверьте правильность ввода',
  401: 'Неверный логин или пароль',
  500: 'Сервис временно недоступен. Попробуйте через минуту.',
};

export const Login: React.FC<LoginProps> = ({ onLogin, expiredMessage }) => {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password }),
      });

      if (!res.ok) {
        const msg = LOGIN_ERRORS[res.status] || 'Ошибка входа';
        console.error('[Login] /api/login failed:', res.status, res.statusText);
        setError(msg);
        setLoading(false);
        return;
      }

      const { token, profile_id, app_role } = await res.json();

      // Inject JWT into module-level currentToken so subsequent supabase-js
      // requests carry Authorization: Bearer <jwt>. Per plan: staff tokens
      // are in-memory only — no sessionStorage write.
      setSessionToken(token);

      // UI-state kept in localStorage for legacy compatibility (admin/owner
      // components receive userId/userRole as props). Two separate setItem
      // calls preserve the existing key/value contract from old Login.tsx.
      localStorage.setItem('userId', profile_id);
      localStorage.setItem('userRole', app_role);

      onLogin(profile_id, app_role);
    } catch (err) {
      console.error('[Login] network error:', err);
      setError('Нет связи с сервером. Проверьте интернет.');
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-secondary/30">
      <Card className="w-full max-w-sm shadow-xl">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2">
            <Lock className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">Вход для Админа</CardTitle>
          <CardDescription>Введите логин и пароль для доступа</CardDescription>
        </CardHeader>
        <CardContent>
          {expiredMessage && (
            <p className="text-sm text-amber-600 font-medium text-center mb-4">
              {expiredMessage}
            </p>
          )}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="login">Логин</Label>
              <Input
                id="login"
                type="text"
                placeholder="Введите логин"
                value={login}
                onChange={(e) => {
                  setLogin(e.target.value);
                  setError('');
                }}
                className={cn(error && "border-destructive")}
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Пароль</Label>
              <Input
                id="password"
                type="password"
                placeholder="Введите пароль"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                className={cn(error && "border-destructive")}
                autoComplete="current-password"
              />
              {error && <p className="text-sm text-destructive font-medium text-center">{error}</p>}
            </div>
            <Button type="submit" className="w-full h-12 text-lg" disabled={!login || !password || loading}>
              {loading ? 'Вход...' : 'Войти'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};