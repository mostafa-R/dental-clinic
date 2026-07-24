import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import Button from "../../components/ui/Button";
import { login, verify2faLogin, clear2faChallenge } from "./authSlice";
import { t } from "../../lib/i18n";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [twoFaCode, setTwoFaCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [backupCode, setBackupCode] = useState("");
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { language } = useSelector((state) => state.ui);
  const { loading, error, requires2fa, challengeToken, challengeAdminId } = useSelector(
    (state) => state.auth,
  );

  useEffect(() => {
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = language;
  }, [language]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await dispatch(login({ email, password }));
    if (!result.error) {
      if (!result.payload?.requires2fa) {
        navigate("/");
      }
    }
  };

  const handle2faSubmit = async (e) => {
    e.preventDefault();
    const payload = useBackupCode
      ? { adminId: challengeAdminId, challengeToken, backupCode }
      : { adminId: challengeAdminId, challengeToken, token: twoFaCode };
    const result = await dispatch(verify2faLogin(payload));
    if (!result.error) {
      navigate("/");
    }
  };

  const handleBackToLogin = () => {
    dispatch(clear2faChallenge());
    setTwoFaCode("");
    setBackupCode("");
    setUseBackupCode(false);
  };

  if (requires2fa) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
        <div className="max-w-md w-full">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-8">
            <div className="flex items-center justify-center gap-3 mb-8">
              <div className="w-12 h-12 bg-indigo-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xl">DO</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                  Dental OS
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t("twoFactorChallenge", language)}
                </p>
              </div>
            </div>

            <form onSubmit={handle2faSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {useBackupCode ? t("enterBackupCode", language) : t("twoFactorChallengeDesc", language)}
                </label>
                {useBackupCode ? (
                  <input
                    type="text"
                    value={backupCode}
                    onChange={(e) => setBackupCode(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors font-mono"
                    placeholder="XXXX-XXXX"
                  />
                ) : (
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={twoFaCode}
                    onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    required
                    className="w-full px-4 py-2.5 text-lg text-center tracking-widest border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
                    placeholder="000000"
                  />
                )}
              </div>

              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}

              <Button type="submit" className="w-full" loading={loading}>
                {t("verifyToken", language)}
              </Button>

              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setUseBackupCode(!useBackupCode);
                    setTwoFaCode("");
                    setBackupCode("");
                  }}
                  className="text-sm text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                >
                  {useBackupCode
                    ? t("twoFactorChallengeDesc", language)
                    : t("backupCodeOption", language)}
                </button>
                <button
                  type="button"
                  onClick={handleBackToLogin}
                  className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  {t("cancel", language)}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
      <div className="max-w-md w-full">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-8">
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-12 h-12 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xl">DO</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                Dental OS
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Site Dashboard
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
              >
                {t("email", language)}
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
                placeholder="admin@dentalos.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
              >
                {t("password", language)}
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <Button type="submit" className="w-full" loading={loading}>
              Sign in
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
          Site administrator access only
        </p>
      </div>
    </div>
  );
}
