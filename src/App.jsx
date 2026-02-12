import Layout from './components/Layout';
import ParamPanel from './components/ParamPanel';
import ResultList from './components/ResultList';
import useScreener from './hooks/useScreener';
import useSectors from './hooks/useSectors';

export default function App() {
  const { sectors, loading: sectorsLoading } = useSectors();
  const {
    params,
    setParams,
    results,
    meta,
    loading,
    progress,
    scan,
  } = useScreener();

  return (
    <Layout>
      <ParamPanel
        params={params}
        setParams={setParams}
        sectors={sectors}
        sectorsLoading={sectorsLoading}
        onSearch={scan}
        loading={loading}
      />
      <ResultList results={results} meta={meta} loading={loading} progress={progress} />
    </Layout>
  );
}
