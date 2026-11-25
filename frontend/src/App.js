import React from "react";
import {BrowserRouter as Router, Routes, Route, Navigate} from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import LicenseList from "./pages/LicenseList";
import APIKeyList from "./pages/APIKeyList";
import UserManagement from "./pages/UserManagement";
import About from "./pages/About";
import {isAuthenticated} from "./utils/auth";

// Redirect to the login page when no token is stored.
function ProtectedRoute({children}) {
    return isAuthenticated() ? children : <Navigate to="/" replace/>;
}

function App() {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<Login/>}/>
                <Route path="/dashboard" element={<ProtectedRoute><Dashboard/></ProtectedRoute>}/>
                <Route path="/settings" element={<ProtectedRoute><Settings/></ProtectedRoute>}/>
                <Route path="/licenses" element={<ProtectedRoute><LicenseList/></ProtectedRoute>}/>
                <Route path="/api-keys" element={<ProtectedRoute><APIKeyList/></ProtectedRoute>}/>
                <Route path="/users" element={<ProtectedRoute><UserManagement/></ProtectedRoute>}/>
                <Route path="/about" element={<ProtectedRoute><About/></ProtectedRoute>}/>
            </Routes>
        </Router>
    );
}

export default App;
