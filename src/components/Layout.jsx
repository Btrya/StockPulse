import { Layout as AntLayout, Button, Tag, Popconfirm } from 'antd';
import { LogoutOutlined } from '@ant-design/icons';
import StatusBar from './StatusBar';
import { useAuth } from '../contexts/AuthContext';

const { Header, Content } = AntLayout;

const ROLE_LABELS = {
  user: { label: '普通', color: 'blue' },
  premium: { label: '高级', color: 'gold' },
  admin: { label: '管理员', color: 'red' },
};

export default function Layout({ scanKlt, children }) {
  const { role, session, logout } = useAuth();
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
            <span className="text-slate-400 text-sm">{session?.email.split('@')[0]}</span>
            <Popconfirm
              title="确认退出登录？"
              onConfirm={logout}
              okText="退出"
              cancelText="取消"
              placement="bottomRight"
            >
              <Button size="small" icon={<LogoutOutlined />} type="text" style={{ color: '#64748b' }} />
            </Popconfirm>
          </div>
        </div>
      </Header>
      <Content className="max-w-7xl w-full mx-auto px-4 py-4">
        {children}
      </Content>
    </AntLayout>
  );
}
