import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { cn } from '../../lib/utils';
import { Lock, Eye, EyeOff, Info } from 'lucide-react';
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
  const [showDemoCreds, setShowDemoCreds] = useState(false);
  const [showDemoPassword, setShowDemoPassword] = useState(false);

  // DEMO credentials (placeholder — actual passwords set by owner in DEMO DB).
  // Click a chip to autofill the form. In a real production build these
  // would not exist; this block is gated on the DEMO_URL hostname below.
  const isDemoBuild =
    typeof window !== 'undefined' &&
    (window.location.hostname.includes('demo') ||
      window.location.hostname === 'localhost' ||
      window.location.hostname.startsWith('192.168.') ||
      window.location.hostname.endsWith('.vercel.app') && window.location.hostname.startsWith('demo'));
  const demoCreds = [
    { label: 'Владелец', login: 'demo_owner', password: 'demo123', role: 'owner', color: 'amber' },
    { label: 'Админ',    login: 'demo_admin', password: 'demo123', role: 'admin', color: 'blue' },
  ];

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
      // requests carry Authorization: Bearer <jwt>. Issue 14: setSessionToken
      // ALSO persists to sessionStorage so a page reload (F5) within the same
      // tab restores the session without forcing the user to log in again.
      // Closing the tab clears sessionStorage and the next open will need login.
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
          <form onSubmit={handleLogin} className="space-y-4" autoComplete="off">
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
                autoComplete="off"
                name="demo-login-field"
                data-1p-ignore
                data-form-type="other"
                data-lpignore="true"
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
                autoComplete="off"
                name="demo-password-field"
                data-1p-ignore
                data-form-type="other"
                data-lpignore="true"
              />
              {error && <p className="text-sm text-destructive font-medium text-center">{error}</p>}
            </div>
            <Button type="submit" className="w-full h-12 text-lg" disabled={!login || !password || loading}>
              {loading ? 'Вход...' : 'Войти'}
            </Button>
          </form>

          {isDemoBuild && (
            <div className="mt-6 pt-4 border-t-2 border-amber-400 bg-amber-50 rounded-lg p-4 -mx-2">
              <button
                type="button"
                onClick={() => setShowDemoCreds(!showDemoCreds)}
                className="w-full flex items-center justify-center gap-2 text-base font-bold text-amber-900 hover:text-amber-700 transition-colors py-2"
              >
                <Info className="w-5 h-5" />
                <span>Демо акаунты разверни чтобы получить логи и пароль</span>
              </button>
              {showDemoCreds && (
                <div className="mt-4 space-y-2 text-xs">
                  <div className="flex items-center justify-end mb-2">
                    <button
                      type="button"
                      onClick={() => setShowDemoPassword(!showDemoPassword)}
                      className="text-gray-500 hover:text-gray-800 flex items-center gap-1 text-xs"
                      title={showDemoPassword ? 'Скрыть пароли' : 'Показать пароли'}
                    >
                      {showDemoPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      <span>{showDemoPassword ? 'Скрыть' : 'Показать'}</span>
                    </button>
                  </div>
                  {demoCreds.map((cred) => (
                    <button
                      key={cred.role}
                      type="button"
                      onClick={() => {
                        setLogin(cred.login);
                        setPassword(cred.password);
                        setError('');
                      }}
                      className={cn(
                        "w-full text-left p-2 rounded-md border transition-all hover:shadow-sm",
                        cred.color === 'amber' && "border-amber-300 bg-amber-50 hover:bg-amber-100",
                        cred.color === 'blue' && "border-blue-300 bg-blue-50 hover:bg-blue-100",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-gray-900">{cred.label}</div>
                        <span className="text-[10px] text-gray-500 bg-white px-1.5 py-0.5 rounded border">клик → заполнить</span>
                      </div>
                      <div className="text-gray-600 mt-0.5 font-mono text-[11px]">
                        <span>логин: {cred.login}</span>
                        <span className="mx-1.5">•</span>
                        <span>пароль: {showDemoPassword ? cred.password : '••••••••'}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};