import React from "react";
import {useLanguage} from "../i18n";

/** Error boundary: styled fallback with a translated Reload button. */
class ErrorBoundaryInner extends React.Component {
  constructor(props) {
    super(props);
    this.state = {hasError: false};
  }

  static getDerivedStateFromError() {
    return {hasError: true};
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    const {t} = this.props;
    if (this.state.hasError) {
      return (
        <div className="error-boundary glass-card">
          <h1 className="gradient-text">{t("common.errorTitle")}</h1>
          <p style={{color: "var(--muted)"}}>{t("common.errorBody")}</p>
          <button onClick={() => window.location.reload()}>{t("common.reload")}</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function ErrorBoundary({children}) {
  const {t} = useLanguage();
  return <ErrorBoundaryInner t={t}>{children}</ErrorBoundaryInner>;
}
