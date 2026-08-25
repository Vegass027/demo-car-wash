import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { cn } from '../../lib/utils';
import { Lock } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface LoginProps {
  onLogin: (userId: string, userRole: 'admin' | 'owner') => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Проверяем логин и пароль через RPC функцию
      const { data: authData, error: rpcError } = await supabase.rpc('verify_password', {
        p_login: login,
        p_password: password,
      });

      if (rpcError) {
        console.error('[Login] Ошибка RPC:', rpcError);
        setError('Ошибка авторизации');
        setLoading(false);
        return;
      }

      if (!authData || authData.length === 0) {
        console.log('[Login] Пользователь не найден');
        setError('Неверный логин или пароль');
        setLoading(false);
        return;
      }

      const profile = authData[0];
      console.log('[Login] Профиль найден, роль:', profile.role);

      // Проверяем успешность проверки пароля
      if (!profile.success) {
        console.log('[Login] Неверный пароль');
        setError('Неверный логин или пароль');
        setLoading(false);
        return;
      }

      // Проверяем роль
      if (profile.role !== 'admin' && profile.role !== 'owner') {
        console.log('[Login] Роль не подходит:', profile.role);
        setError('Доступ запрещён');
        setLoading(false);
        return;
      }

      console.log('[Login] Успешный вход, роль:', profile.role);

      // Обновляем last_auth_method
      await supabase
        .from('profiles')
        .update({ last_auth_method: 'password', updated_at: new Date().toISOString() })
        .eq('id', profile.id);

      // Сохраняем в localStorage
      localStorage.setItem('userId', profile.id);
      localStorage.setItem('userRole', profile.role);

      onLogin(profile.id, profile.role);
    } catch (err) {
      console.error('[Login] Ошибка входа:', err);
      setError('Ошибка входа');
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
