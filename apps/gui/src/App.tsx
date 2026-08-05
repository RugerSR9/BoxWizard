import { Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { ToastContainer } from "./components/Toast";
import { AppDataProvider, useAppData } from "./context/AppDataContext";
import { Dashboard } from "./pages/Dashboard";
import { Environments } from "./pages/Environments";
import { Templates } from "./pages/Templates";
import { Settings } from "./pages/Settings";

/**
 * Router root. Adding a new page is: create it under src/pages, add a
 * <Route> here, and add a nav entry in components/layout/Sidebar.tsx.
 */
function AppRoutes() {
  const { toasts, dismissToast } = useAppData();

  return (
    <AppShell>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/environments" element={<Environments />} />
        <Route path="/templates" element={<Templates />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </AppShell>
  );
}

function App() {
  return (
    <AppDataProvider>
      <AppRoutes />
    </AppDataProvider>
  );
}

export default App;
