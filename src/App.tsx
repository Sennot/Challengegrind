import { BrowserRouter, Route, Routes } from "react-router";
import { AuthProvider } from "./lib/auth";
import Layout from "./components/Layout";
import ListPage from "./pages/ListPage";
import LevelPage from "./pages/LevelPage";
import StatsPage from "./pages/StatsPage";
import PacksPage from "./pages/PacksPage";
import ProfilePage from "./pages/ProfilePage";
import ChangelogPage from "./pages/ChangelogPage";
import SubmitPage from "./pages/SubmitPage";
import SubmitLevelPage from "./pages/SubmitLevelPage";
import SettingsPage from "./pages/SettingsPage";
import NotificationsPage from "./pages/NotificationsPage";
import AdminPage from "./pages/admin/AdminPage";
import { LoginPage, RegisterPage } from "./pages/AuthPages";
import { NotFoundPage, RulesPage, SocialsPage, TeamPage } from "./pages/InfoPages";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<ListPage />} />
            <Route path="level/:id" element={<LevelPage />} />
            <Route path="packs" element={<PacksPage />} />
            <Route path="stats" element={<StatsPage />} />
            <Route path="player/:username" element={<ProfilePage />} />
            <Route path="changelog" element={<ChangelogPage />} />
            <Route path="submit" element={<SubmitPage />} />
            <Route path="submit-level" element={<SubmitLevelPage />} />
            <Route path="rules" element={<RulesPage />} />
            <Route path="team" element={<TeamPage />} />
            <Route path="socials" element={<SocialsPage />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="register" element={<RegisterPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="admin" element={<AdminPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
