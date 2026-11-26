import React from "react";
import {BrowserRouter, HashRouter, Routes, Route, Navigate} from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import LicenseList from "./pages/LicenseList";
import APIKeyList from "./pages/APIKeyList";
import UserManagement from "./pages/UserManagement";
import About from "./pages/About";
import Products from "./pages/Products";
import ProductGroups from "./pages/ProductGroups";
import ApiDocs from "./pages/ApiDocs";
import AuditLogs from "./pages/AuditLogs";
import Blacklist from "./pages/Blacklist";
import Downloads from "./pages/Downloads";
import Notifications from "./pages/Notifications";
import Roles from "./pages/Roles";
import Profile from "./pages/Profile";
import Layout from "./components/Layout";
import ErrorBoundary from "./components/ErrorBoundary";
import {ToastProvider} from "./components/Toast";
import {LanguageProvider} from "./i18n";
import {ThemeProvider} from "./theme";
import {isAuthenticated, getCurrentRole} from "./utils/auth";
import {DEMO_MODE} from "./config";

function ProtectedRoute({children}) {
    return isAuthenticated() ? children : <Navigate to="/" replace/>;
}

function AdminRoute({children}) {
    if (!isAuthenticated()) return <Navigate to="/" replace/>;
    return getCurrentRole() === "admin" ? children : <Navigate to="/dashboard" replace/>;
}

const Router = DEMO_MODE ? HashRouter : BrowserRouter;

function App() {
    return (
        <ThemeProvider>
            <LanguageProvider>
                <ToastProvider>
                <Router>
                    <Routes>
                        <Route path="/" element={<Login/>}/>
                        <Route element={<ProtectedRoute><ErrorBoundary><Layout/></ErrorBoundary></ProtectedRoute>}>
                            <Route path="/dashboard" element={<Dashboard/>}/>
                            <Route path="/products" element={<Products/>}/>
                            <Route path="/product-groups" element={<ProductGroups/>}/>
                            <Route path="/licenses" element={<LicenseList/>}/>
                            <Route path="/api-keys" element={<APIKeyList/>}/>
                            <Route path="/users" element={<UserManagement/>}/>
                            <Route path="/roles" element={<AdminRoute><Roles/></AdminRoute>}/>
                            <Route path="/profile" element={<Profile/>}/>
                            <Route path="/audit-logs" element={<AuditLogs/>}/>
                            <Route path="/languages" element={<Navigate to="/settings?tab=languages" replace />} />
                            <Route path="/docs" element={<ApiDocs/>}/>
                            <Route path="/settings" element={<Settings/>}/>
                            <Route path="/about" element={<About/>}/>
                            <Route path="/blacklist" element={<Blacklist/>}/>
                            <Route path="/downloads" element={<Downloads/>}/>
                            <Route path="/notifications" element={<Notifications/>}/>
                        </Route>
                    </Routes>
                </Router>
                </ToastProvider>
            </LanguageProvider>
        </ThemeProvider>
    );
}

export default App;
