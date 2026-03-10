import { useState } from 'react';
import { Layout as AntLayout, Button, Tag } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import StatusBar from './StatusBar';
import LoginModal from './LoginModal';
import { useAuth } from '../contexts/AuthContext';

const { Header, Content } = AntLayout;

const ROLE_LABELS = {
  guest: null,
  user: { label: '普通', color: 'blue' },
  premium: { label: '高级', color: 'gold' },
  admin: { label: '管理员', color: 'red' },
};

export default function Layout({ scanKlt, children }) {
  const [loginOpen, setLoginOpen] = useState(false);
  const { role, session } = useAuth();
  const roleInfo = ROLE_LABELS[role];

  return (
    <AntLayout className="min-h-screen">
      <Header className="flex items-center justify-between px-4 md:px-6" style={{ background: '#0f172a' }}>
        <h1 className="text-lg font-bold tracking-tight text-amber-400 m-0">
          StockPulse
        </h1>
        <div className="flex items-center gap-3">
          <StatusBar klt={scanKlt} />
          <div className="flex items-center gap-2">
            {roleInfo && <Tag color={roleInfo.color} className="m-0">{roleInfo.label}</Tag>}
            <Button
              size="small"
              icon={<UserOutlined />}
              onClick={() => setLoginOpen(true)}
              type={session ? 'text' : 'default'}
              style={session ? { color: '#94a3b8' } : {}}
            >
              {session ? session.email.split('@')[0] : '登录'}
            </Button>
          </div>
        </div>
      </Header>
      <Content className="max-w-7xl w-full mx-auto px-4 py-4">
        {children}
      </Content>
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </AntLayout>
  );
}
