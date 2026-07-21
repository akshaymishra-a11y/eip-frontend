import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth, RequireOrg, RedirectIfAuthed } from './routes/guards';
import { AppShellLayout } from './routes/AppShellLayout';

import Login from './pages/auth/Login';
import Signup from './pages/auth/Signup';
import ForgotPassword from './pages/auth/ForgotPassword';
import CreateOrganization from './pages/CreateOrganization';
import OrganizationDashboard from './pages/OrganizationDashboard';
import ProjectList from './pages/ProjectList';
import CreateProjectWizard from './pages/CreateProjectWizard';
import ProjectOverview from './pages/project/ProjectOverview';
import ArchitectureView from './pages/project/ArchitectureView';
import DeliveryDashboard from './pages/project/DeliveryDashboard';
import DeliveryHealthDashboard from './pages/project/DeliveryHealthDashboard';
import ApiDashboard from './pages/project/ApiDashboard';
import ErrorDashboard from './pages/project/ErrorDashboard';
import SecurityDashboard from './pages/project/SecurityDashboard';
import InfrastructureDashboard from './pages/project/InfrastructureDashboard';
import CloudDashboard from './pages/project/CloudDashboard';
import CloudArchitectureExplorer from './pages/project/CloudArchitectureExplorer';
import RequirementsDashboard from './pages/project/RequirementsDashboard';
import RequirementDocumentDetail from './pages/project/RequirementDocumentDetail';
import IncidentsDashboard from './pages/project/IncidentsDashboard';
import ProjectSettings from './pages/project/ProjectSettings';
import TracesDashboard from './pages/project/TracesDashboard';
import TraceDetails from './pages/project/TraceDetails';
import ServiceDependencyGraph from './pages/project/ServiceDependencyGraph';
import DatabaseDetails from './pages/project/DatabaseDetails';
import LogsExplorer from './pages/project/LogsExplorer';
import SdkSetup from './pages/project/SdkSetup';
import ProjectOnboarding from './pages/project/ProjectOnboarding';
import AlertsDashboard from './pages/AlertsDashboard';
import UserProfile from './pages/UserProfile';
import TeamManagement from './pages/TeamManagement';
import HealthCenter from './pages/HealthCenter';
import OrgBilling from './pages/OrgBilling';
import OrgAiSettings from './pages/OrgAiSettings';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<RedirectIfAuthed><Login /></RedirectIfAuthed>} />
      <Route path="/signup" element={<RedirectIfAuthed><Signup /></RedirectIfAuthed>} />
      <Route path="/forgot-password" element={<RedirectIfAuthed><ForgotPassword /></RedirectIfAuthed>} />

      <Route element={<RequireAuth />}>
        <Route path="/organizations/new" element={<CreateOrganization />} />

        <Route element={<RequireOrg />}>
          <Route element={<AppShellLayout />}>
            <Route path="/" element={<OrganizationDashboard />} />
            <Route path="/projects" element={<ProjectList />} />
            <Route path="/projects/new" element={<CreateProjectWizard />} />
            <Route path="/alerts" element={<AlertsDashboard />} />
            <Route path="/health" element={<HealthCenter />} />
            <Route path="/team" element={<TeamManagement />} />
            <Route path="/billing" element={<OrgBilling />} />
            <Route path="/ai-settings" element={<OrgAiSettings />} />
            <Route path="/profile" element={<UserProfile />} />

            <Route path="/projects/:projectId">
              <Route index element={<ProjectOverview />} />
              <Route path="architecture" element={<ArchitectureView />} />
              <Route path="delivery" element={<DeliveryDashboard />} />
              <Route path="delivery-health" element={<DeliveryHealthDashboard />} />
              <Route path="api" element={<ApiDashboard />} />
              <Route path="errors" element={<ErrorDashboard />} />
              <Route path="incidents" element={<IncidentsDashboard />} />
              <Route path="security" element={<SecurityDashboard />} />
              <Route path="infrastructure" element={<InfrastructureDashboard />} />
              <Route path="cloud" element={<CloudDashboard />} />
              <Route path="cloud-architecture" element={<CloudArchitectureExplorer />} />
              <Route path="requirements" element={<RequirementsDashboard />} />
              <Route path="requirements/:documentId" element={<RequirementDocumentDetail />} />
              <Route path="traces" element={<TracesDashboard />} />
              <Route path="traces/:traceId" element={<TraceDetails />} />
              <Route path="dependencies" element={<ServiceDependencyGraph />} />
              <Route path="dependencies/db/:dbType" element={<DatabaseDetails />} />
              <Route path="logs" element={<LogsExplorer />} />
              <Route path="sdk-setup" element={<SdkSetup />} />
              <Route path="onboarding" element={<ProjectOnboarding />} />
              <Route path="settings" element={<ProjectSettings />} />
            </Route>
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
