import React from "react";
import {BrowserRouter as Router, Routes, Route} from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import LicenseList from "./pages/LicenseList";
import APIKeyList from "./pages/APIKeyList";
import UserManagement from "./pages/UserManagement";
import About from "./pages/About";

function App() {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<Login/>}/>
                <Route path="/dashboard" element={<Dashboard/>}/>
                <Route path="/settings" element={<Settings/>}/>
                <Route path="/licenses" element={<LicenseList/>}/>
                <Route path="/api-keys" element={<APIKeyList/>}/>
                <Route path="/users" element={<UserManagement/>}/>
                <Route path="/about" element={<About/>}/>
            </Routes>
        </Router>
    );
}

export default App;