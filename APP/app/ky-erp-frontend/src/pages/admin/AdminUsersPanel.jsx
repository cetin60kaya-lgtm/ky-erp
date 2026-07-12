import { useEffect, useMemo, useState } from "react";
import {
  activateUser,
  createUser,
  deactivateUser,
  listUsers,
  resetUserPassword,
  updateUser,
  updateUserPermissions,
} from "../../services/adminApi";
import "./AdminUsersPanel.css";

const MODULE_KEYS = [
  "DASHBOARD",
  "MUHASEBE",
  "FIRMA_CARI",
  "BELGE_ISLEM",
  "KDV",
  "CEK_ODEME",
  "DESEN",
  "IMALAT",
  "BOYAHANE",
  "IK",
  "ADMIN",
  "RAPORLAR",
];

const ROLE_OPTIONS = [
  "ADMIN",
  "MUHASEBE",
  "DESEN",
  "IMALAT",
  "BOYAHANE",
  "IK",
  "VIEWER",
];

function emptyForm() {
  return {
    id: "",
    username: "",
    password: "",
    fullName: "",
    role: "VIEWER",
    isActive: true,
  };
}

function emptyPermissionRow(moduleKey) {
  return {
    moduleKey,
    canView: false,
    canCreate: false,
    canUpdate: false,
    canDelete: false,
    canApprove: false,
  };
}

function normalizePermissions(rows) {
  const map = new Map();
  for (const key of MODULE_KEYS) {
    map.set(key, emptyPermissionRow(key));
  }
  if (Array.isArray(rows)) {
    for (const row of rows) {
      const key = String(row?.moduleKey || "").toUpperCase();
      if (!map.has(key)) continue;
      map.set(key, {
        moduleKey: key,
        canView: row.canView === true,
        canCreate: row.canCreate === true,
        canUpdate: row.canUpdate === true,
        canDelete: row.canDelete === true,
        canApprove: row.canApprove === true,
      });
    }
  }
  return Array.from(map.values());
}

export default function AdminUsersPanel() {
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [permissions, setPermissions] = useState(normalizePermissions([]));
  const [form, setForm] = useState(emptyForm());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Kullanıcılar yükleniyor...");

  const selectedUser = useMemo(
    () => users.find((item) => item.id === selectedUserId) || null,
    [users, selectedUserId],
  );

  async function loadUsers(preserveSelected = true) {
    try {
      setBusy(true);
      const data = await listUsers();
      const rows = Array.isArray(data) ? data : data?.items || [];
      setUsers(rows);
      setMessage("Kullanıcı listesi güncellendi.");

      const nextId =
        preserveSelected &&
        selectedUserId &&
        rows.some((item) => item.id === selectedUserId)
          ? selectedUserId
          : rows[0]?.id || "";

      setSelectedUserId(nextId);
      const currentPermissions = rows.find(
        (item) => item.id === nextId,
      )?.permissions;
      setPermissions(normalizePermissions(currentPermissions));
    } catch (error) {
      setMessage(`Hata: ${error?.message}`);
      setUsers([]);
      setSelectedUserId("");
      setPermissions(normalizePermissions([]));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadUsers(false);
  }, []);

  useEffect(() => {
    if (!selectedUser) return;
    setPermissions(normalizePermissions(selectedUser.permissions));
  }, [selectedUserId, selectedUser]);

  function editPermission(moduleKey, field, value) {
    setPermissions((prev) =>
      prev.map((row) =>
        row.moduleKey === moduleKey ? { ...row, [field]: value } : row,
      ),
    );
  }

  function editForm(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function startEdit(user) {
    setForm({
      id: user?.id,
      username: user?.username,
      password: "",
      fullName: user?.fullName,
      role: user?.role,
      isActive: user?.isActive !== false,
    });
    setSelectedUserId(user?.id);
  }

  async function handleSaveUser(event) {
    event?.preventDefault();
    try {
      setBusy(true);
      if (form.id) {
        await updateUser(form.id, {
          fullName: form.fullName,
          role: form.role,
          isActive: form.isActive,
        });
        if (form.password.trim()) {
          await resetUserPassword(form.id, form.password.trim());
        }
        setMessage("Kullanıcı güncellendi.");
      } else {
        await createUser({
          username: form.username,
          password: form.password,
          fullName: form.fullName,
          role: form.role,
          isActive: form.isActive,
          permissions,
        });
        setMessage("Kullanıcı oluşturuldu.");
      }
      setForm(emptyForm());
      await loadUsers();
    } catch (error) {
      setMessage(`Hata: ${error?.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleActive(user) {
    try {
      setBusy(true);
      if (user?.isActive) await deactivateUser(user?.id);
      else await activateUser(user?.id);
      setMessage(
        user?.isActive
           ? "Kullanıcı pasife alındı."
          : "Kullanıcı aktifleştirildi.",
      );
      await loadUsers();
    } catch (error) {
      setMessage(`Hata: ${error?.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleSavePermissions() {
    if (!selectedUserId) {
      setMessage("Yetki güncellemek için kullanıcı seçin.");
      return;
    }

    try {
      setBusy(true);
      await updateUserPermissions(selectedUserId, permissions);
      setMessage("Yetkiler güncellendi.");
      await loadUsers();
    } catch (error) {
      setMessage(`Hata: ${error?.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-users-page">
      <header>
        <h2>Kullanıcı Yönetimi</h2>
        <p>{message}</p>
      </header>

      <section className="admin-users-grid">
        <article className="panel">
          <h3>Kullanıcılar</h3>
          <div className="list-wrap">
            {users.map((user) => (
              <button
                key={user?.id}
                type="button"
                className={`list-row ${selectedUserId === user?.id ? "active" : ""}`}
                onClick={() => setSelectedUserId(user?.id)}
              >
                <div>
                  <strong>{user?.fullName}</strong>
                  <span>@{user?.username}</span>
                </div>
                <small>{user?.role}</small>
              </button>
            ))}
          </div>
        </article>

        <article className="panel">
          <h3>{form.id ? "Kullanıcı Güncelle" : "Yeni Kullanıcı"}</h3>
          <form onSubmit={handleSaveUser} className="user-form">
            <label>
              Kullanıcı Adı
              <input
                value={form.username}
                onChange={(event) => editForm("username", event?.target.value)}
                disabled={Boolean(form.id)}
              />
            </label>
            <label>
              Şifre {form.id ? "(boş bırakılırsa değişmez)" : ""}
              <input
                type="password"
                value={form.password}
                onChange={(event) => editForm("password", event?.target.value)}
              />
            </label>
            <label>
              Ad Soyad
              <input
                value={form.fullName}
                onChange={(event) => editForm("fullName", event?.target.value)}
              />
            </label>
            <label>
              Rol
              <select
                value={form.role}
                onChange={(event) => editForm("role", event?.target.value)}
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>
            <label className="check-field">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => editForm("isActive", event?.target.checked)}
              />
              Aktif kullanıcı
            </label>
            <div className="form-actions">
              <button type="submit" disabled={busy}>
                {form.id ? "Güncelle" : "Oluştur"}
              </button>
              <button type="button" onClick={() => setForm(emptyForm())}>
                Temizle
              </button>
              {selectedUser ? (
                <button
                  type="button"
                  onClick={() => {
                    startEdit(selectedUser);
                  }}
                >
                  Seçiliyi Düzenle
                </button>
              ) : null}
              {selectedUser ? (
                <button
                  type="button"
                  onClick={() => handleToggleActive(selectedUser)}
                >
                  {selectedUser.isActive ? "Pasife Al" : "Aktifleştir"}
                </button>
              ) : null}
            </div>
          </form>
        </article>
      </section>

      <section className="panel permissions-panel">
        <div className="panel-head">
          <h3>Modül Yetki Matrisi</h3>
          <button type="button" onClick={handleSavePermissions} disabled={busy}>
            Yetkileri Kaydet
          </button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Modül</th>
              <th>Gör</th>
              <th>Ekle</th>
              <th>Güncelle</th>
              <th>Sil</th>
              <th>Onayla</th>
            </tr>
          </thead>
          <tbody>
            {permissions.map((row) => (
              <tr key={row?.moduleKey}>
                <td>{row?.moduleKey}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={row?.canView}
                    onChange={(event) =>
                      editPermission(
                        row?.moduleKey,
                        "canView",
                        event?.target.checked,
                      )
                    }
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={row?.canCreate}
                    onChange={(event) =>
                      editPermission(
                        row?.moduleKey,
                        "canCreate",
                        event?.target.checked,
                      )
                    }
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={row?.canUpdate}
                    onChange={(event) =>
                      editPermission(
                        row?.moduleKey,
                        "canUpdate",
                        event?.target.checked,
                      )
                    }
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={row?.canDelete}
                    onChange={(event) =>
                      editPermission(
                        row?.moduleKey,
                        "canDelete",
                        event?.target.checked,
                      )
                    }
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={row?.canApprove}
                    onChange={(event) =>
                      editPermission(
                        row?.moduleKey,
                        "canApprove",
                        event?.target.checked,
                      )
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
