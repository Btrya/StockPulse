import { useState } from 'react';
import { Tabs } from 'antd';
import { FilterOutlined, LineChartOutlined, ExperimentOutlined } from '@ant-design/icons';
import Layout from './components/Layout';
import ParamPanel from './components/ParamPanel';
import ResultList from './components/ResultList';
import TrackingView from './components/TrackingView';
import BacktestView from './components/BacktestView';
import useScreener from './hooks/useScreener';
import useTracking from './hooks/useTracking';
import useBacktest from './hooks/useBacktest';

export default function App() {
  const screener = useScreener();
  const tracking = useTracking();
  const backtest = useBacktest();
  const [activeTab, setActiveTab] = useState('screener');

  const handleTabChange = (key) => {
    setActiveTab(key);
    if (key === 'tracking') tracking.activate();
  };

  // 共享行业/概念列表（screener 自动加载，作为其他 tab 的 fallback）
  const sharedIndustries = screener.meta?.industries || [];
  const sharedConcepts = screener.meta?.concepts || [];

  const items = [
    {
      key: 'screener',
      label: <span><FilterOutlined /> 筛选</span>,
      children: (
        <>
          <ParamPanel
            params={screener.params}
            setParams={screener.setParams}
            industries={screener.meta?.industries}
            concepts={screener.meta?.concepts}
            onSearch={screener.scan}
            loading={screener.loading}
          />
          <ResultList results={screener.results} meta={screener.meta} loading={screener.loading} />
        </>
      ),
    },
    {
      key: 'tracking',
      label: <span><LineChartOutlined /> 追踪</span>,
      children: (
        <TrackingView
          params={tracking.params}
          setParams={tracking.setParams}
          results={tracking.results}
          meta={tracking.meta}
          loading={tracking.loading}
          refresh={tracking.refresh}
          sharedIndustries={sharedIndustries}
          sharedConcepts={sharedConcepts}
        />
      ),
    },
    {
      key: 'backtest',
      label: <span><ExperimentOutlined /> 回测</span>,
      children: (
        <BacktestView
          params={backtest.params}
          setParams={backtest.setParams}
          date={backtest.date}
          setDate={backtest.setDate}
          backtestIndustries={backtest.backtestIndustries}
          setBacktestIndustries={backtest.setBacktestIndustries}
          backtestConcepts={backtest.backtestConcepts}
          setBacktestConcepts={backtest.setBacktestConcepts}
          results={backtest.results}
          meta={backtest.meta}
          loading={backtest.loading}
          scanning={backtest.scanning}
          scanInfo={backtest.scanInfo}
          startBacktest={backtest.startBacktest}
          refresh={backtest.refresh}
          cleanup={backtest.cleanup}
          sharedIndustries={sharedIndustries}
          sharedConcepts={sharedConcepts}
        />
      ),
    },
  ];

  return (
    <Layout scanKlt={screener.params.klt}>
      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={items}
        size="large"
        className="stock-tabs"
      />
    </Layout>
  );
}
