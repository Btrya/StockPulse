import { useState } from 'react';
import { Tabs } from 'antd';
import { FilterOutlined, LineChartOutlined, ExperimentOutlined, SearchOutlined, ThunderboltOutlined } from '@ant-design/icons';
import Layout from './components/Layout';
import ParamPanel from './components/ParamPanel';
import ResultList from './components/ResultList';
import TrackingView from './components/TrackingView';
import BacktestView from './components/BacktestView';
import StockSearch from './components/StockSearch';
import SwingTradeView from './components/SwingTradeView';
import useScreener from './hooks/useScreener';
import useTracking from './hooks/useTracking';
import useBacktest from './hooks/useBacktest';
import useHotData from './hooks/useHotData';
import useSwingTrade from './hooks/useSwingTrade';

export default function App() {
  const screener = useScreener();
  const tracking = useTracking();
  const backtest = useBacktest();
  const swingTrade = useSwingTrade();
  const { hotData } = useHotData();
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
            date={screener.date}
            setDate={screener.setDate}
            industries={screener.meta?.industries}
            concepts={screener.meta?.concepts}
            onSearch={screener.scan}
            loading={screener.loading}
            hotData={hotData}
          />
          <ResultList results={screener.results} meta={screener.meta} loading={screener.loading} hotData={hotData} />
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
          date={tracking.date}
          setDate={tracking.setDate}
          results={tracking.results}
          meta={tracking.meta}
          loading={tracking.loading}
          refresh={tracking.refresh}
          sharedIndustries={sharedIndustries}
          sharedConcepts={sharedConcepts}
          hotData={hotData}
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
          results={backtest.results}
          meta={backtest.meta}
          loading={backtest.loading}
          scanning={backtest.scanning}
          scanInfo={backtest.scanInfo}
          queue={backtest.queue}
          startBacktest={backtest.startBacktest}
          refresh={backtest.refresh}
          cleanup={backtest.cleanup}
          sharedIndustries={sharedIndustries}
          sharedConcepts={sharedConcepts}
          hotData={hotData}
        />
      ),
    },
    {
      key: 'swing',
      label: <span><ThunderboltOutlined /> 超短线</span>,
      children: (
        <SwingTradeView
          subTab={swingTrade.subTab}
          setSubTab={swingTrade.setSubTab}
          line={swingTrade.line}
          setLine={swingTrade.setLine}
          date={swingTrade.date}
          setDate={swingTrade.setDate}
          excludeBoards={swingTrade.excludeBoards}
          setExcludeBoards={swingTrade.setExcludeBoards}
          results={swingTrade.results}
          meta={swingTrade.meta}
          loading={swingTrade.loading}
          refresh={swingTrade.refresh}
          hotData={hotData}
        />
      ),
    },
    {
      key: 'search',
      label: <span><SearchOutlined /> 查询</span>,
      children: <StockSearch />,
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
