import { useState } from 'react';
import { Modal, Input, Button, message, Tag } from 'antd';
import { MailOutlined, LockOutlined, LogoutOutlined } from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';

const ROLE_LABELS = {
  guest: { label: '游客', color: 'default' },
  user: { label: '普通用户', color: 'blue' },
  premium: { label: '高级用户', color: 'gold' },
  admin: { label: '管理员', color: 'red' },
};

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

export default function LoginModal({ open, onClose }) {
  const { login, logout, session, role } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim()) return message.warning('请输入邮箱');
    setLoading(true);
    try {
      const data = await apiLogin(email.trim());
      login(data);
      message.success(`欢迎，${ROLE_LABELS[data.role]?.label || data.role}！`);
      onClose();
    } catch (err) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    message.info('已退出登录');
    onClose();
  };

  if (session) {
    const roleInfo = ROLE_LABELS[role] || ROLE_LABELS.guest;
    return (
      <Modal
        open={open}
        onCancel={onClose}
        footer={null}
        title="账号信息"
        width={340}
      >
        <div className="py-4 flex flex-col gap-4 items-center">
          <div className="text-center">
            <div className="text-slate-400 text-sm mb-1">当前账号</div>
            <div className="font-medium">{session.email}</div>
          </div>
          <Tag color={roleInfo.color} className="text-base px-4 py-1">
            {roleInfo.label}
          </Tag>
          <Button icon={<LogoutOutlined />} onClick={handleLogout} className="mt-2">
            退出登录
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={<span><LockOutlined className="mr-2" />登录</span>}
      width={380}
    >
      <div className="py-4 flex flex-col gap-4">
        <div className="text-slate-400 text-sm">
          输入授权邮箱即可免密登录，登录状态将保存在本地。
        </div>
        <Input
          prefix={<MailOutlined className="text-slate-400" />}
          placeholder="your@email.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onPressEnter={handleLogin}
          size="large"
          autoFocus
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
    </Modal>
  );
}
