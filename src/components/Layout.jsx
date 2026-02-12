import { Layout as AntLayout } from 'antd';
import StatusBar from './StatusBar';

const { Header, Content } = AntLayout;

export default function Layout({ children }) {
  return (
    <AntLayout className="min-h-screen">
      <Header className="flex items-center justify-between px-4 md:px-6" style={{ background: '#0f172a' }}>
        <h1 className="text-lg font-bold tracking-tight text-amber-400 m-0">
          StockPulse
        </h1>
        <StatusBar />
      </Header>
      <Content className="max-w-7xl w-full mx-auto px-4 py-4">
        {children}
      </Content>
    </AntLayout>
  );
}
