import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { PxlKitIcon } from "@pxlkit/core";
import { User } from "@pxlkit/social";
import UpdateInfoModal from "../UpdateInfoModal";
import UploadResumeModal from "../UploadResumeModal";
import UploadGithubModal from "../UploadGithubModal";
import "./index.css";

const NAV_LINKS = [{ to: "/chat", label: "面试" }] as const;

const Layout = () => {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showGithubModal, setShowGithubModal] = useState(false);

  return (
    <div className="layout">
      <nav className="layout__nav">
        <div className="layout__nav-inner">
          <Link className="layout__logo" to="/chat">
            MADAO CHAT
          </Link>
          <div className="layout__links">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                className={`layout__link${location.pathname === link.to ? " layout__link--active" : ""}`}
                to={link.to}
              >
                {link.label}
              </Link>
            ))}
          </div>
          <div className="layout__auth-links">
            {user ? (
              <div className="layout__dropdown-wrapper">
                <button
                  className="layout__user-trigger"
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                >
                  <span className="layout__user-avatar">
                    <PxlKitIcon icon={User} size={20} colorful />
                  </span>
                  <span className="layout__username">{user.username}</span>
                  <span
                    className={`layout__dropdown-arrow${menuOpen ? " layout__dropdown-arrow--open" : ""}`}
                  >
                    ▾
                  </span>
                </button>
                {menuOpen && (
                  <>
                    <div
                      className="layout__dropdown-backdrop"
                      onClick={() => setMenuOpen(false)}
                    />
                    <div className="layout__dropdown-menu">
                      <button
                        className="layout__dropdown-item"
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          setShowUpdateModal(true);
                        }}
                      >
                        个人信息
                      </button>
                      <button
                        className="layout__dropdown-item"
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          setShowUploadModal(true);
                        }}
                      >
                        上传简历
                      </button>
                      <button
                        className="layout__dropdown-item"
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          setShowGithubModal(true);
                        }}
                      >
                        上传 GitHub
                      </button>
                      <div className="layout__dropdown-sep" />
                      <button
                        className="layout__dropdown-item layout__dropdown-item--danger"
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          logout();
                        }}
                      >
                        登出
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <>
                <Link className="layout__link" to="/login">
                  登录
                </Link>
                <Link
                  className="layout__link layout__link--accent"
                  to="/register"
                >
                  注册
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>
      <main className="layout__main">
        <Outlet />
      </main>
      {showUpdateModal && (
        <UpdateInfoModal onClose={() => setShowUpdateModal(false)} />
      )}
      {showUploadModal && (
        <UploadResumeModal onClose={() => setShowUploadModal(false)} />
      )}
      {showGithubModal && (
        <UploadGithubModal onClose={() => setShowGithubModal(false)} />
      )}
    </div>
  );
};

export default Layout;
