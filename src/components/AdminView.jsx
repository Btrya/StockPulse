import { useState, useEffect, useCallback } from 'react';
import { Tabs, Table, Tag, Button, Select, Popconfirm, Input, Space, message, Spin } from 'antd';
import { ReloadOutlined, UserAddOutlined, DeleteOutlined } from '@ant-design/icons';
import { fetchAdminUsers, fetchAdminStats, saveAdminUser, deleteAdminUser, resetAdminStats } from '../lib/api';

const ROLE_OPTIONS = [
  { value: 'user', label: 'user' },
  { value: 'premium', label: 'premium' },
  { value: 'admin', label: 'admin' },
];

const ROLE_COLOR = { admin: 'red', premium: 'gold', user: 'blue' };

const EVENT_LABELS = {
  scan: '筛选',
  tracking: '追踪',
  backtest: '回测',
  swing: '超短线',
  export: '导出',
  post_analysis: '复盘',
  total: '合计',
};

function UsersTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAdminUsers();
      setUsers(res.users || []);
    } catch (err) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email) return message.warning('请输入邮箱');
    setSaving(true);
    try {
      await saveAdminUser(email, newRole);
      message.success(`已保存 ${email}`);
      setNewEmail('');
      load();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (email) => {
    try {
      await deleteAdminUser(email);
      message.success(`已删除 ${email}`);
      load();
    } catch (err) {
      message.error(err.message);
    }
  };

  const handleRoleChange = async (email, role) => {
    try {
      await saveAdminUser(email, role);
      message.success('已更新');
      load();
    } catch (err) {
      message.error(err.message);
    }
  };

  const columns = [
    {
      title: '邮箱',
      dataIndex: 'email',
      render: v => <span className="num text-xs">{v}</span>,
    },
    {
      title: '角色',
      dataIndex: 'role',
      width: 150,
      render: (v, record) => (
        <Select
          value={v}
          options={ROLE_OPTIONS}
          size="small"
          style={{ width: 100 }}
          onChange={role => handleRoleChange(record.email, role)}
        />
      ),
    },
    {
      title: '',
      width: 60,
      render: (_, record) => (
        <Popconfirm title={`删除 ${record.email}？`} onConfirm={() => handleDelete(record.email)} okText="删除" cancelText="取消">
          <Button size="small" type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <Space className="mb-4">
        <Input
          placeholder="邮箱"
          value={newEmail}
          onChange={e => setNewEmail(e.target.value)}
          onPressEnter={handleSave}
          size="small"
          style={{ width: 220 }}
        />
        <Select
          value={newRole}
          options={ROLE_OPTIONS}
          onChange={setNewRole}
          size="small"
          style={{ width: 100 }}
        />
        <Button
          type="primary"
          size="small"
          icon={<UserAddOutlined />}
          loading={saving}
          onClick={handleSave}
        >
          添加 / 更新
        </Button>
        <Button size="small" icon={<ReloadOutlined />} onClick={load} />
      </Space>
      <Table
        columns={columns}
        dataSource={users}
        rowKey="email"
        size="small"
        loading={loading}
        pagination={false}
      />
    </div>
  );
}

function StatsTab() {
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAdminStats();
      setStats(res.stats || []);
    } catch (err) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleReset = async (email) => {
    try {
      await resetAdminStats(email);
      message.success(`已清空 ${email} 的统计`);
      load();
    } catch (err) {
      message.error(err.message);
    }
  };

  const eventKeys = ['scan', 'tracking', 'backtest', 'swing', 'export', 'post_analysis', 'total'];

  const columns = [
    {
      title: '邮箱',
      dataIndex: 'email',
      render: v => <span className="num text-xs">{v}</span>,
    },
    {
      title: '角色',
      dataIndex: 'role',
      width: 80,
      render: v => <Tag color={ROLE_COLOR[v] || 'default'}>{v}</Tag>,
    },
    ...eventKeys.map(key => ({
      title: EVENT_LABELS[key] || key,
      dataIndex: key,
      width: 70,
      align: 'right',
      sorter: (a, b) => (Number(a[key]) || 0) - (Number(b[key]) || 0),
      render: v => (
        <span className={`num text-xs ${key === 'total' ? 'font-medium text-slate-200' : 'text-slate-400'}`}>
          {v ? Number(v) : '-'}
        </span>
      ),
    })),
    {
      title: '最后访问',
      dataIndex: 'last_seen',
      width: 160,
      render: v => v
        ? <span className="text-xs text-slate-500">{new Date(v).toLocaleString('zh-CN', { hour12: false })}</span>
        : '-',
    },
    {
      title: '',
      width: 60,
      render: (_, record) => (
        <Popconfirm title={`清空 ${record.email} 的统计数据？`} onConfirm={() => handleReset(record.email)} okText="清空" cancelText="取消">
          <Button size="small" type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button size="small" icon={<ReloadOutlined />} onClick={load}>刷新</Button>
      </div>
      {loading ? (
        <div className="text-center py-8"><Spin /></div>
      ) : (
        <Table
          columns={columns}
          dataSource={stats}
          rowKey="email"
          size="small"
          pagination={false}
          scroll={{ x: 800 }}
        />
      )}
    </div>
  );
}

export default function AdminView() {
  const items = [
    { key: 'users', label: '用户管理', children: <UsersTab /> },
    { key: 'stats', label: '使用统计', children: <StatsTab /> },
  ];

  return (
    <div className="max-w-4xl">
      <Tabs items={items} size="small" />
    </div>
  );
}
