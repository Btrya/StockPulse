import { useState } from 'react';
import { Input, Button, message } from 'antd';
import { MailOutlined } from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';

async function apiLogin(email) {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '登录失败');
  return data;
}

export default function LoginGate({ children }) {
  const { session, login } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  if (session) return children;

  const handleLogin = async () => {
    if (!email.trim()) return message.warning('请输入邮箱');
    setLoading(true);
    try {
      const data = await apiLogin(email.trim());
      login(data);
    } catch (err) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0f172a' }}>
      <div className="w-full max-w-sm mx-4">
        <h1 className="text-2xl font-bold text-amber-400 text-center mb-8 tracking-tight">
          StockPulse
        </h1>
        <div className="bg-slate-800 rounded-xl p-8 flex flex-col gap-4 shadow-2xl">
          <div className="text-slate-300 text-sm text-center">
            请输入授权邮箱登录
          </div>
          <Input
            prefix={<MailOutlined className="text-slate-400" />}
            placeholder="your@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onPressEnter={handleLogin}
            size="large"
            autoFocus
            style={{ background: '#1e293b', borderColor: '#334155', color: '#f1f5f9' }}
          />
          <Button
            type="primary"
            size="large"
            loading={loading}
            onClick={handleLogin}
            block
          >
            登录
          </Button>
        </div>
      </div>
    </div>
  );
}
