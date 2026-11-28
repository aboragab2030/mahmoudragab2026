import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { invokeBackend } from '@/lib/backend';
import { UserCog, Edit2, Save, X, User, Shield, RefreshCw, Crown, UserCheck, Trash2, AlertTriangle, Power, Key, Lock, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { withMinSpin } from '@/lib/refreshSpin';
import type { StaffMember } from '@/hooks/useRealtimeSync';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

import {
  ACCOUNTING_PERMISSIONS,
  DASHBOARD_PERMISSIONS,
  GENERAL_EVALUATION_PERMISSIONS,
  MEDICAL_VIDEO_PERMISSIONS,
  OFFER_PERMISSIONS,
  PARTNER_PERMISSIONS,
  PATIENT_BILLING_PAYMENT_PERMISSIONS,
  PATIENT_PERMISSIONS,
  STAFF_BOOKING_PERMISSIONS,
} from './permissions';

// Available permissions for staff members: one per dashboard section
const AVAILABLE_PERMISSIONS = DASHBOARD_PERMISSIONS;
const GENERAL_PERMISSIONS = DASHBOARD_PERMISSIONS.filter(p => !p.group);

interface StaffManagementProps {
  inputClass: string;
  cardClass: string;
  currentUserId?: string;
}

export function StaffManagement({ inputClass, cardClass, currentUserId }: StaffManagementProps) {
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ 
    name: '', 
    username: '', 
    loginUsername: '',
    role: 'staff' as 'admin' | 'staff',
    permissions: [] as string[],
    isActive: true
  });
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  
  // Password change state
  const [passwordChangeId, setPasswordChangeId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  
  // Store profiles and roles separately for combining
  const [profiles, setProfiles] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);

  // Combine profiles and roles into staff members
  const combineStaffData = useCallback((profilesData: any[], rolesData: any[]): StaffMember[] => {
    return (profilesData || []).map(profile => {
      const roleData = rolesData?.find(r => r.user_id === profile.user_id);
      return {
        user_id: profile.user_id,
        name: profile.name,
        username: profile.username,
        login_username: profile.login_username || null,
        role: (roleData?.role as 'admin' | 'staff') || 'staff',
        permissions: profile.permissions || [],
        is_active: profile.is_active !== false,
      };
    });
  }, []);

  // Update staff members when profiles or roles change
  useEffect(() => {
    const combined = combineStaffData(profiles, roles);
    setStaffMembers(combined);
  }, [profiles, roles, combineStaffData]);

  const fetchStaffMembers = useCallback(async () => {
    setLoading(true);
    try {
      const [profilesRes, rolesRes] = await Promise.all([
        supabase.from('profiles').select('user_id, name, username, login_username, permissions, is_active'),
        supabase.from('user_roles').select('user_id, role'),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (rolesRes.error) throw rolesRes.error;

      setProfiles(profilesRes.data || []);
      setRoles(rolesRes.data || []);
    } catch (error) {
      console.error('Error fetching staff:', error);
      toast.error('حدث خطأ أثناء جلب بيانات الموظفين');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleManualRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await withMinSpin(() => fetchStaffMembers());
    } finally {
      setRefreshing(false);
    }
  }, [fetchStaffMembers]);

  // Set up realtime subscriptions for profiles and user_roles
  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    const setupRealtimeSync = async () => {
      await fetchStaffMembers();
      if (cancelled) return;

      channel = supabase
        .channel(`staff-management-sync-${Math.random().toString(36).slice(2)}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'profiles' },
          (payload: RealtimePostgresChangesPayload<any>) => {
            setProfiles(prev => {
              if (payload.eventType === 'INSERT') {
                return [payload.new, ...prev];
              } else if (payload.eventType === 'UPDATE') {
                const index = prev.findIndex(p => p.user_id === payload.new.user_id);
                if (index !== -1) {
                  const updated = [...prev];
                  updated[index] = payload.new;
                  return updated;
                }
                return prev;
              } else if (payload.eventType === 'DELETE') {
                return prev.filter(p => p.user_id !== payload.old.user_id);
              }
              return prev;
            });
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'user_roles' },
          (payload: RealtimePostgresChangesPayload<any>) => {
            setRoles(prev => {
              if (payload.eventType === 'INSERT') {
                return [payload.new, ...prev];
              } else if (payload.eventType === 'UPDATE') {
                const index = prev.findIndex(r => r.user_id === payload.new.user_id);
                if (index !== -1) {
                  const updated = [...prev];
                  updated[index] = payload.new;
                  return updated;
                }
                return prev;
              } else if (payload.eventType === 'DELETE') {
                return prev.filter(r => r.user_id !== payload.old.user_id);
              }
              return prev;
            });
          }
        )
        .subscribe();
    };

    setupRealtimeSync();

    return () => {
      cancelled = true;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [fetchStaffMembers]);

  const handleEdit = (member: StaffMember) => {
    setEditingId(member.user_id);
    setEditForm({
      name: member.name,
      username: member.username || '',
      loginUsername: member.login_username || '',
      role: member.role,
      permissions: member.permissions || [],
      isActive: member.is_active !== false,
    });
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditForm({ name: '', username: '', loginUsername: '', role: 'staff', permissions: [], isActive: true });
  };

  const handleSave = async (userId: string) => {
    if (!editForm.name.trim()) {
      toast.error('اسم الموظف مطلوب');
      return;
    }

    // Prevent admin from demoting themselves or disabling themselves
    if (userId === currentUserId) {
      if (editForm.role !== 'admin') {
        toast.error('لا يمكنك تغيير دورك الخاص');
        return;
      }
      if (!editForm.isActive) {
        toast.error('لا يمكنك تعطيل حسابك الخاص');
        return;
      }
    }

    setSaving(true);
    try {
      // Update profile with all fields
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          name: editForm.name.trim(),
          username: editForm.username.trim() || null,
          login_username: editForm.loginUsername.trim() || null,
          permissions: editForm.permissions,
          is_active: editForm.isActive,
        })
        .eq('user_id', userId);

      if (profileError) throw profileError;

      // Check if role exists
      const existingRole = roles.find(r => r.user_id === userId);
      
      if (existingRole) {
        // Update existing role
        const { error: roleError } = await supabase
          .from('user_roles')
          .update({ role: editForm.role })
          .eq('user_id', userId);

        if (roleError) throw roleError;
      } else {
        // Insert new role if it doesn't exist
        const { error: roleError } = await supabase
          .from('user_roles')
          .insert({ user_id: userId, role: editForm.role });

        if (roleError) throw roleError;
      }

      toast.success('تم تحديث بيانات الموظف بنجاح');
      setEditingId(null);
      setEditForm({ name: '', username: '', loginUsername: '', role: 'staff', permissions: [], isActive: true });
      await fetchStaffMembers();
    } catch (error) {
      console.error('Error updating staff:', error);
      toast.error('حدث خطأ أثناء تحديث البيانات');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (member: StaffMember) => {
    if (member.user_id === currentUserId) {
      toast.error('لا يمكنك تعطيل حسابك الخاص');
      return;
    }

    try {
      const newStatus = !member.is_active;
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: newStatus })
        .eq('user_id', member.user_id);

      if (error) throw error;
      
      toast.success(newStatus ? 'تم تفعيل الحساب' : 'تم تعطيل الحساب');
      await fetchStaffMembers();
    } catch (error) {
      console.error('Error toggling user status:', error);
      toast.error('حدث خطأ أثناء تغيير حالة الحساب');
    }
  };

  const handleTogglePermission = (permId: string) => {
    setEditForm(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permId)
        ? prev.permissions.filter(p => p !== permId)
        : [...prev.permissions, permId]
    }));
  };

  const handleDeleteConfirm = (userId: string) => {
    // Prevent deleting yourself
    if (userId === currentUserId) {
      toast.error('لا يمكنك حذف حسابك الخاص');
      return;
    }
    setDeleteConfirmId(userId);
  };

  const handleDeleteCancel = () => {
    setDeleteConfirmId(null);
  };

  const handleDelete = async (userId: string) => {
    if (userId === currentUserId) {
      toast.error('لا يمكنك حذف حسابك الخاص');
      return;
    }

    setDeleting(true);
    try {
      // Delete user role first (due to foreign key constraints in practice)
      const { error: roleError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      if (roleError) throw roleError;

      // Delete profile
      const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('user_id', userId);

      if (profileError) throw profileError;

      toast.success('تم حذف الموظف بنجاح');
      setDeleteConfirmId(null);
      await fetchStaffMembers();
    } catch (error) {
      console.error('Error deleting staff:', error);
      toast.error('حدث خطأ أثناء حذف الموظف');
    } finally {
      setDeleting(false);
    }
  };

  // Password change handlers
  const handlePasswordChangeStart = (userId: string) => {
    setPasswordChangeId(userId);
    setNewPassword('');
    setConfirmPassword('');
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  };

  const handlePasswordChangeCancel = () => {
    setPasswordChangeId(null);
    setNewPassword('');
    setConfirmPassword('');
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  };

  const handlePasswordChange = async (userId: string) => {
    if (newPassword.length < 6) {
      toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('كلمات المرور غير متطابقة');
      return;
    }

    setChangingPassword(true);
    try {
      // Use admin API to update user password via edge function
      const { data, error } = await invokeBackend('admin-update-password', {
        body: { userId, newPassword }
      });

      if (error) throw error;

      if (!import.meta.env['VITE_SUPABASE_URL']) {
        await supabase.auth.admin?.updateUserById?.(userId, { password: newPassword });
      }

      toast.success('تم تغيير كلمة المرور بنجاح');
      handlePasswordChangeCancel();
    } catch (error: any) {
      console.error('Error changing password:', error);
      if (error?.status === 422 && error?.message) {
        toast.error(error.message);
      } else if (error?.status === 403) {
        toast.error('تغيير كلمة المرور متاح لمدير النظام فقط.');
      } else {
        toast.error('حدث خطأ أثناء تغيير كلمة المرور. تأكد من صلاحيات النظام.');
      }
    } finally {
      setChangingPassword(false);
    }
  };

  const getRoleLabel = (role: 'admin' | 'staff') => {
    return role === 'admin' ? 'مدير نظام' : 'موظف';
  };

  const getRoleColor = (role: 'admin' | 'staff') => {
    return role === 'admin' 
      ? 'bg-[#1769AA]/10 text-[#1769AA] border border-[#1769AA]/20' 
      : 'bg-[#087F8C]/10 text-[#087F8C] border border-[#087F8C]/20';
  };

  const getRoleIcon = (role: 'admin' | 'staff') => {
    return role === 'admin' ? Crown : UserCheck;
  };

  // Add new user state
  const [showAddUser, setShowAddUser] = useState(false);
  const [addUserForm, setAddUserForm] = useState({
    password: '',
    name: '',
    loginUsername: '',
    role: 'staff' as 'admin' | 'staff',
    permissions: [] as string[],
  });
  const [showAddPassword, setShowAddPassword] = useState(false);
  const [addingUser, setAddingUser] = useState(false);

  const handleAddUser = async () => {
    if (!addUserForm.name.trim() || !addUserForm.loginUsername.trim() || !addUserForm.password) {
      toast.error('يرجى ملء الاسم واسم المستخدم للدخول وكلمة المرور');
      return;
    }
    if (addUserForm.password.length < 6) {
      toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    
    setAddingUser(true);
    try {
      const cleanName = addUserForm.name.trim();
      const cleanLoginUsername = addUserForm.loginUsername.trim();
      const assignedPermissions = addUserForm.role === 'admin' ? AVAILABLE_PERMISSIONS.map(p => p.id) : addUserForm.permissions;

      const { data, error } = await invokeBackend('add-staff-user', {
        body: {
          password: addUserForm.password,
          name: cleanName,
          loginUsername: cleanLoginUsername,
          role: addUserForm.role,
          permissions: assignedPermissions,
        }
      });

      if (error) throw error;

      if (!import.meta.env['VITE_SUPABASE_URL'] && data?.userId && data?.email) {
        await (supabase.auth.admin as any)?.createUser?.({
          id: data.userId,
          email: data.email,
          password: addUserForm.password,
          user_metadata: {
            name: cleanName,
            username: cleanLoginUsername,
            login_username: cleanLoginUsername,
            role: addUserForm.role,
          },
        });
        await supabase.from('profiles').upsert(
          {
            user_id: data.userId,
            name: cleanName,
            username: cleanLoginUsername,
            login_username: cleanLoginUsername,
            permissions: assignedPermissions,
            is_active: true,
          },
          { onConflict: 'user_id' },
        );
        await supabase.from('user_roles').upsert(
          { user_id: data.userId, role: addUserForm.role },
          { onConflict: 'user_id,role' },
        );
      }
      
      toast.success('تم إضافة المستخدم بنجاح');
      setShowAddUser(false);
      setShowAddPassword(false);
      setAddUserForm({ password: '', name: '', loginUsername: '', role: 'staff', permissions: [] });
      // Refresh the list
      await fetchStaffMembers();
    } catch (error: any) {
      console.error('Error adding user:', error);
      toast.error(error?.message || 'حدث خطأ أثناء إضافة المستخدم');
    } finally {
      setAddingUser(false);
    }
  };

  const handleToggleAddPermission = (permId: string) => {
    setAddUserForm(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permId)
        ? prev.permissions.filter(p => p !== permId)
        : [...prev.permissions, permId]
    }));
  };

  return (
    <div className="space-y-6">
      <div className={cardClass}>
        <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
          <div className="flex items-center gap-3">
            <UserCog className="w-6 h-6 text-[#087F8C]" />
            <h3 className="text-xl font-black text-[#172B3A]">إدارة الموظفين المسجلين</h3>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAddUser(!showAddUser)}
              className="flex items-center gap-2 fv-btn-primary text-white px-4 py-2 rounded-xl text-sm font-bold cursor-pointer"
            >
              <User size={16} />
              إضافة مستخدم
            </button>
            <button
              type="button"
              onClick={() => void handleManualRefresh()}
              disabled={loading || refreshing}
              className="flex items-center gap-2 bg-[#F5FAFC] border border-[#DFEAF0] hover:border-[#087F8C] text-[#172B3A] px-4 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw size={16} className={loading || refreshing ? 'animate-spin text-[#087F8C]' : 'text-[#087F8C]'} />
              تحديث
            </button>
          </div>
        </div>

        {/* Add User Form */}
        {showAddUser && (
          <div className="mb-6 p-6 bg-[#F5FAFC] rounded-2xl border border-[#DFEAF0] space-y-4">
            <h4 className="font-black text-[#172B3A] flex items-center gap-2">
              <User size={18} className="text-[#087F8C]" />
              إضافة مستخدم جديد
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-[#718394] mb-1.5 block">الاسم الكامل *</label>
                <input
                  type="text"
                  value={addUserForm.name}
                  onChange={e => setAddUserForm({ ...addUserForm, name: e.target.value })}
                  className={inputClass}
                  placeholder="أدخل اسم الموظف"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#718394] mb-1.5 block">اسم المستخدم للدخول *</label>
                <input
                  type="text"
                  value={addUserForm.loginUsername}
                  onChange={e => setAddUserForm({ ...addUserForm, loginUsername: e.target.value })}
                  className={`${inputClass} fv-mono`}
                  placeholder="اسم مختصر لتسجيل الدخول"
                  dir="ltr"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-bold text-[#718394] mb-1.5 block">كلمة المرور *</label>
                <div className="relative">
                  <input
                    type={showAddPassword ? 'text' : 'password'}
                    value={addUserForm.password}
                    onChange={e => setAddUserForm({ ...addUserForm, password: e.target.value })}
                    className={`${inputClass} pl-11`}
                    placeholder="6 أحرف على الأقل"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAddPassword(prev => !prev)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[#718394] hover:text-[#172B3A] transition-colors cursor-pointer"
                    aria-label={showAddPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    title={showAddPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  >
                    {showAddPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-[#718394] mb-2 block">الدور الوظيفي</label>
              <div className="grid grid-cols-2 gap-2 max-w-xs">
                <button
                  type="button"
                  onClick={() => setAddUserForm({ ...addUserForm, role: 'staff' })}
                  className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                    addUserForm.role === 'staff' ? 'bg-[#087F8C] text-white' : 'bg-white border border-[#DFEAF0] text-[#718394] hover:text-[#172B3A]'
                  }`}
                >
                  <UserCheck size={16} /> موظف
                </button>
                <button
                  type="button"
                  onClick={() => setAddUserForm({ ...addUserForm, role: 'admin' })}
                  className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                    addUserForm.role === 'admin' ? 'bg-[#1769AA] text-white' : 'bg-white border border-[#DFEAF0] text-[#718394] hover:text-[#172B3A]'
                  }`}
                >
                  <Crown size={16} /> مدير
                </button>
              </div>
            </div>
            {addUserForm.role === 'staff' && (
              <div>
                <label className="text-xs font-bold text-[#718394] mb-2 block">الصلاحيات</label>
                <div className="max-h-56 overflow-y-auto bg-white rounded-xl p-3 border border-[#DFEAF0] space-y-1.5">
                  {GENERAL_PERMISSIONS.map(perm => (
                    <label key={perm.id} className="flex items-center gap-2.5 cursor-pointer hover:bg-[#F5FAFC] p-2 rounded-lg transition-colors">
                      <input
                        type="checkbox"
                        checked={addUserForm.permissions.includes(perm.id)}
                        onChange={() => handleToggleAddPermission(perm.id)}
                        className="w-4 h-4 text-[#087F8C] rounded-sm border-[#DFEAF0] focus:ring-[#087F8C]"
                      />
                      <span className="text-sm font-bold text-[#172B3A]">{perm.label}</span>
                    </label>
                  ))}
                  {[
                    { title: 'تسجيل وإدارة المرضى', list: PATIENT_PERMISSIONS },
                    { title: 'حجوزات الموظفين', list: STAFF_BOOKING_PERMISSIONS },
                    { title: 'قسم الحسابات', list: ACCOUNTING_PERMISSIONS },
                    { title: 'حسابات المرضى وتأكيد المدفوعات', list: PATIENT_BILLING_PAYMENT_PERMISSIONS },
                  ].map(group => (
                    <div key={group.title} className="pt-2 mt-2 border-t border-[#DFEAF0]">
                      <div className="flex items-center justify-between px-2 py-1">
                        <p className="text-xs font-black text-[#087F8C]">{group.title}</p>
                        <button
                          type="button"
                          onClick={() => {
                            const ids = group.list.map(p => p.id);
                            const allSelected = ids.every(id => addUserForm.permissions.includes(id));
                            setAddUserForm(prev => ({
                              ...prev,
                              permissions: allSelected
                                ? prev.permissions.filter(p => !ids.includes(p))
                                : Array.from(new Set([...prev.permissions, ...ids])),
                            }));
                          }}
                          className="text-[11px] font-bold text-[#1769AA] hover:underline"
                        >
                          {group.list.every(p => addUserForm.permissions.includes(p.id)) ? 'إلغاء الكل' : 'تحديد الكل'}
                        </button>
                      </div>
                      {group.list.map(perm => (
                        <label key={perm.id} className="flex items-center gap-2.5 cursor-pointer hover:bg-[#F5FAFC] p-2 rounded-lg transition-colors">
                          <input
                            type="checkbox"
                            checked={addUserForm.permissions.includes(perm.id)}
                            onChange={() => handleToggleAddPermission(perm.id)}
                            className="w-4 h-4 text-[#087F8C] rounded-sm border-[#DFEAF0] focus:ring-[#087F8C]"
                          />
                          <span className="text-sm font-bold text-[#172B3A]">{perm.label}</span>
                        </label>
                      ))}
                    </div>
                  ))}
                  <div className="pt-2 mt-2 border-t border-[#DFEAF0]">
                    <p className="text-xs font-black text-[#087F8C] px-2 py-1">شركاء النجاح</p>
                    {PARTNER_PERMISSIONS.map(perm => (
                      <label key={perm.id} className="flex items-center gap-2.5 cursor-pointer hover:bg-[#F5FAFC] p-2 rounded-lg transition-colors">
                        <input
                          type="checkbox"
                          checked={addUserForm.permissions.includes(perm.id)}
                          onChange={() => handleToggleAddPermission(perm.id)}
                          className="w-4 h-4 text-[#087F8C] rounded-sm border-[#DFEAF0] focus:ring-[#087F8C]"
                        />
                        <span className="text-sm font-bold text-[#172B3A]">{perm.label}</span>
                      </label>
                    ))}
                  </div>
                  <div className="pt-2 mt-2 border-t border-[#DFEAF0]">
                    <p className="text-xs font-black text-[#087F8C] px-2 py-1">العروض</p>
                    {OFFER_PERMISSIONS.map(perm => (
                      <label key={perm.id} className="flex items-center gap-2.5 cursor-pointer hover:bg-[#F5FAFC] p-2 rounded-lg transition-colors">
                        <input
                          type="checkbox"
                          checked={addUserForm.permissions.includes(perm.id)}
                          onChange={() => handleToggleAddPermission(perm.id)}
                          className="w-4 h-4 text-[#087F8C] rounded-sm border-[#DFEAF0] focus:ring-[#087F8C]"
                        />
                        <span className="text-sm font-bold text-[#172B3A]">{perm.label}</span>
                      </label>
                    ))}
                  </div>
                  <div className="pt-2 mt-2 border-t border-[#DFEAF0]">
                    <p className="text-xs font-black text-[#087F8C] px-2 py-1">مكتبة الفيديوهات الطبية</p>
                    {MEDICAL_VIDEO_PERMISSIONS.map(perm => (
                      <label key={perm.id} className="flex items-center gap-2.5 cursor-pointer hover:bg-[#F5FAFC] p-2 rounded-lg transition-colors">
                        <input
                          type="checkbox"
                          checked={addUserForm.permissions.includes(perm.id)}
                          onChange={() => handleToggleAddPermission(perm.id)}
                          className="w-4 h-4 text-[#087F8C] rounded-sm border-[#DFEAF0] focus:ring-[#087F8C]"
                        />
                        <span className="text-sm font-bold text-[#172B3A]">{perm.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleAddUser}
                disabled={addingUser}
                className="flex items-center gap-2 fv-btn-primary text-white py-2.5 px-6 rounded-xl text-sm font-bold disabled:opacity-50 cursor-pointer"
              >
                <Save size={16} />
                {addingUser ? 'جاري الإضافة...' : 'إضافة المستخدم'}
              </button>
              <button
                onClick={() => setShowAddUser(false)}
                className="flex items-center gap-2 bg-white border border-[#DFEAF0] text-[#718394] py-2.5 px-6 rounded-xl text-sm font-bold hover:text-[#172B3A] transition-colors cursor-pointer"
              >
                <X size={16} /> إلغاء
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 animate-spin text-[#087F8C]" />
          </div>
        ) : staffMembers.length === 0 ? (
          <div className="text-center py-12 text-[#718394]">
            <User className="w-16 h-16 mx-auto mb-4 opacity-40 text-[#087F8C]" />
            <p className="font-bold text-[#172B3A]">لا يوجد موظفين مسجلين</p>
            <p className="text-sm mt-1">سيظهر الموظفون هنا بعد تسجيل حساباتهم</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {staffMembers.map(member => {
              const RoleIcon = getRoleIcon(member.role);
              const isCurrentUser = member.user_id === currentUserId;
              const isDeleting = deleteConfirmId === member.user_id;
              
              return (
                <div
                  key={member.user_id}
                  className={`bg-[#F5FAFC] rounded-2xl p-5 border transition-all ${
                    isCurrentUser ? 'border-[#087F8C]/40 bg-[#087F8C]/[0.04]' : 'border-[#DFEAF0] hover:border-[#25B8C7]/50'
                  }`}
                >
                  {isDeleting ? (
                    // Delete Confirmation Mode
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 text-red-600">
                        <AlertTriangle className="w-6 h-6" />
                        <span className="font-black">تأكيد الحذف</span>
                      </div>
                      <p className="text-sm text-[#718394]">
                        هل أنت متأكد من حذف الموظف <strong className="text-[#172B3A]">{member.name}</strong>؟
                        <br />
                        <span className="text-red-600 font-bold">هذا الإجراء لا يمكن التراجع عنه.</span>
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDelete(member.user_id)}
                          disabled={deleting}
                          className="flex-1 flex items-center justify-center gap-2 bg-red-600 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-red-700 transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          <Trash2 size={16} />
                          {deleting ? 'جاري الحذف...' : 'تأكيد الحذف'}
                        </button>
                        <button
                          onClick={handleDeleteCancel}
                          disabled={deleting}
                          className="flex-1 flex items-center justify-center gap-2 bg-white border border-[#DFEAF0] text-[#718394] py-2.5 rounded-xl text-sm font-bold hover:text-[#172B3A] transition-colors cursor-pointer"
                        >
                          <X size={16} />
                          إلغاء
                        </button>
                      </div>
                    </div>
                  ) : editingId === member.user_id ? (
                    // Edit Mode
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-bold text-[#718394] mb-1.5 block">
                          اسم الموظف
                        </label>
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                          className={inputClass}
                          placeholder="أدخل اسم الموظف"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-[#718394] mb-1.5 block">
                          اسم المستخدم (للعرض)
                        </label>
                        <input
                          type="text"
                          value={editForm.username}
                          onChange={e => setEditForm({ ...editForm, username: e.target.value })}
                          className={`${inputClass} fv-mono`}
                          placeholder="أدخل اسم المستخدم للعرض (اختياري)"
                          dir="ltr"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-[#718394] mb-1.5 block">
                          اسم المستخدم للدخول
                        </label>
                        <input
                          type="text"
                          value={editForm.loginUsername}
                          onChange={e => setEditForm({ ...editForm, loginUsername: e.target.value })}
                          className={`${inputClass} fv-mono`}
                          placeholder="أدخل اسم المستخدم لتسجيل الدخول"
                          dir="ltr"
                        />
                        <p className="text-xs text-[#718394] mt-1">يُستخدم بدلاً من البريد الإلكتروني عند تسجيل الدخول</p>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-[#718394] mb-1.5 block">
                          الدور الوظيفي
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setEditForm({ ...editForm, role: 'staff' })}
                            disabled={isCurrentUser}
                            className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                              editForm.role === 'staff'
                                ? 'bg-[#087F8C] text-white'
                                : 'bg-white border border-[#DFEAF0] text-[#718394] hover:text-[#172B3A]'
                            } ${isCurrentUser ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            <UserCheck size={16} />
                            موظف
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditForm({ ...editForm, role: 'admin' })}
                            disabled={isCurrentUser}
                            className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                              editForm.role === 'admin'
                                ? 'bg-[#1769AA] text-white'
                                : 'bg-white border border-[#DFEAF0] text-[#718394] hover:text-[#172B3A]'
                            } ${isCurrentUser ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            <Crown size={16} />
                            مدير
                          </button>
                        </div>
                        {isCurrentUser && (
                          <p className="text-xs text-amber-600 mt-2">
                            لا يمكنك تغيير دورك الخاص
                          </p>
                        )}
                      </div>
                      
                      {/* Permissions Section - Only for staff role */}
                      {editForm.role === 'staff' && (
                        <div>
                          <label className="text-xs font-bold text-[#718394] mb-2 block">
                            الصلاحيات (للموظفين فقط)
                          </label>
                          <div className="max-h-56 overflow-y-auto bg-white rounded-xl p-3 border border-[#DFEAF0] space-y-1.5">
                            {GENERAL_PERMISSIONS.map(perm => (
                              <label key={perm.id} className="flex items-center gap-2.5 cursor-pointer hover:bg-[#F5FAFC] p-2 rounded-lg transition-colors">
                                <input
                                  type="checkbox"
                                  checked={editForm.permissions.includes(perm.id)}
                                  onChange={() => handleTogglePermission(perm.id)}
                                  className="w-4 h-4 text-[#087F8C] rounded-sm border-[#DFEAF0] focus:ring-[#087F8C]"
                                />
                                <span className="text-sm font-bold text-[#172B3A]">{perm.label}</span>
                              </label>
                            ))}
                            {[
                              { title: 'تسجيل وإدارة المرضى', list: PATIENT_PERMISSIONS },
                              { title: 'حجوزات الموظفين', list: STAFF_BOOKING_PERMISSIONS },
                              { title: 'قسم الحسابات', list: ACCOUNTING_PERMISSIONS },
                              { title: 'حسابات المرضى وتأكيد المدفوعات', list: PATIENT_BILLING_PAYMENT_PERMISSIONS },
                              { title: 'التقييم العام', list: GENERAL_EVALUATION_PERMISSIONS },
                            ].map(group => (
                              <div key={group.title} className="pt-2 mt-2 border-t border-[#DFEAF0]">
                                <div className="flex items-center justify-between px-2 py-1">
                                  <p className="text-xs font-black text-[#087F8C]">{group.title}</p>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const ids = group.list.map(p => p.id);
                                      const allSelected = ids.every(id => editForm.permissions.includes(id));
                                      setEditForm(prev => ({
                                        ...prev,
                                        permissions: allSelected
                                          ? prev.permissions.filter(p => !ids.includes(p))
                                          : Array.from(new Set([...prev.permissions, ...ids])),
                                      }));
                                    }}
                                    className="text-[11px] font-bold text-[#1769AA] hover:underline"
                                  >
                                    {group.list.every(p => editForm.permissions.includes(p.id)) ? 'إلغاء الكل' : 'تحديد الكل'}
                                  </button>
                                </div>
                                {group.list.map(perm => (
                                  <label key={perm.id} className="flex items-center gap-2.5 cursor-pointer hover:bg-[#F5FAFC] p-2 rounded-lg transition-colors">
                                    <input
                                      type="checkbox"
                                      checked={editForm.permissions.includes(perm.id)}
                                      onChange={() => handleTogglePermission(perm.id)}
                                      className="w-4 h-4 text-[#087F8C] rounded-sm border-[#DFEAF0] focus:ring-[#087F8C]"
                                    />
                                    <span className="text-sm font-bold text-[#172B3A]">{perm.label}</span>
                                  </label>
                                ))}
                              </div>
                            ))}
                            <div className="pt-2 mt-2 border-t border-[#DFEAF0]">
                              <p className="text-xs font-black text-[#087F8C] px-2 py-1">شركاء النجاح</p>
                              {PARTNER_PERMISSIONS.map(perm => (
                                <label key={perm.id} className="flex items-center gap-2.5 cursor-pointer hover:bg-[#F5FAFC] p-2 rounded-lg transition-colors">
                                  <input
                                    type="checkbox"
                                    checked={editForm.permissions.includes(perm.id)}
                                    onChange={() => handleTogglePermission(perm.id)}
                                    className="w-4 h-4 text-[#087F8C] rounded-sm border-[#DFEAF0] focus:ring-[#087F8C]"
                                  />
                                  <span className="text-sm font-bold text-[#172B3A]">{perm.label}</span>
                                </label>
                              ))}
                            </div>
                            <div className="pt-2 mt-2 border-t border-[#DFEAF0]">
                              <p className="text-xs font-black text-[#087F8C] px-2 py-1">العروض</p>
                              {OFFER_PERMISSIONS.map(perm => (
                                <label key={perm.id} className="flex items-center gap-2.5 cursor-pointer hover:bg-[#F5FAFC] p-2 rounded-lg transition-colors">
                                  <input
                                    type="checkbox"
                                    checked={editForm.permissions.includes(perm.id)}
                                    onChange={() => handleTogglePermission(perm.id)}
                                    className="w-4 h-4 text-[#087F8C] rounded-sm border-[#DFEAF0] focus:ring-[#087F8C]"
                                  />
                                  <span className="text-sm font-bold text-[#172B3A]">{perm.label}</span>
                                </label>
                              ))}
                            </div>
                            <div className="pt-2 mt-2 border-t border-[#DFEAF0]">
                              <p className="text-xs font-black text-[#087F8C] px-2 py-1">مكتبة الفيديوهات الطبية</p>
                              {MEDICAL_VIDEO_PERMISSIONS.map(perm => (
                                <label key={perm.id} className="flex items-center gap-2.5 cursor-pointer hover:bg-[#F5FAFC] p-2 rounded-lg transition-colors">
                                  <input
                                    type="checkbox"
                                    checked={editForm.permissions.includes(perm.id)}
                                    onChange={() => handleTogglePermission(perm.id)}
                                    className="w-4 h-4 text-[#087F8C] rounded-sm border-[#DFEAF0] focus:ring-[#087F8C]"
                                  />
                                  <span className="text-sm font-bold text-[#172B3A]">{perm.label}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                          <p className="text-xs text-[#718394] mt-2">المدير يملك كل الصلاحيات تلقائياً</p>
                        </div>
                      )}
                      
                      {/* Active Status Toggle */}
                      {!isCurrentUser && (
                        <div>
                          <label className="text-xs font-bold text-[#718394] mb-1.5 block">
                            حالة الحساب
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setEditForm({ ...editForm, isActive: true })}
                              className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                                editForm.isActive
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-white border border-[#DFEAF0] text-[#718394] hover:text-[#172B3A]'
                              }`}
                            >
                              <Power size={16} />
                              نشط
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditForm({ ...editForm, isActive: false })}
                              className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                                !editForm.isActive
                                  ? 'bg-red-600 text-white'
                                  : 'bg-white border border-[#DFEAF0] text-[#718394] hover:text-[#172B3A]'
                              }`}
                            >
                              <Power size={16} />
                              معطل
                            </button>
                          </div>
                        </div>
                      )}
                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={() => handleSave(member.user_id)}
                          disabled={saving}
                          className="flex-1 flex items-center justify-center gap-2 fv-btn-primary text-white py-2.5 rounded-xl text-sm font-bold disabled:opacity-50 cursor-pointer"
                        >
                          <Save size={16} />
                          {saving ? 'جاري الحفظ...' : 'حفظ'}
                        </button>
                        <button
                          onClick={handleCancel}
                          disabled={saving}
                          className="flex-1 flex items-center justify-center gap-2 bg-white border border-[#DFEAF0] text-[#718394] py-2.5 rounded-xl text-sm font-bold hover:text-[#172B3A] transition-colors cursor-pointer"
                        >
                          <X size={16} />
                          إلغاء
                        </button>
                      </div>
                    </div>
                  ) : (
                    // View Mode
                    <>
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl ${
                            member.role === 'admin' ? 'bg-[#1769AA]/10 text-[#1769AA] border border-[#1769AA]/20' : 'bg-[#087F8C]/10 text-[#087F8C] border border-[#087F8C]/20'
                          }`}>
                            {member.name.charAt(0)}
                          </div>
                          <div>
                            <h4 className="font-black text-[#172B3A] flex items-center gap-2">
                              {member.name}
                              {isCurrentUser && (
                                <span className="text-[11px] bg-[#087F8C]/10 text-[#087F8C] border border-[#087F8C]/20 px-2 py-0.5 rounded-full font-bold">
                                  أنت
                                </span>
                              )}
                            </h4>
                            {member.username && (
                              <p className="text-xs text-[#718394] fv-mono flex items-center gap-1 mt-0.5" dir="ltr">
                                @{member.username}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="space-y-2 mb-4">
                        <div className={`flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-xl ${getRoleColor(member.role)}`}>
                          <RoleIcon size={15} />
                          <span>{getRoleLabel(member.role)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-[#718394] font-bold px-1">
                          <Shield size={14} className="text-[#087F8C]" />
                          <span className="fv-num">{member.role === 'admin' ? 'جميع الصلاحيات' : `${member.permissions?.length || 0} صلاحيات`}</span>
                        </div>
                        {/* Active Status Indicator */}
                        <div className={`flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-xl border ${
                          member.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80' : 'bg-red-50 text-red-700 border-red-200/80'
                        }`}>
                          <Power size={14} />
                          <span>{member.is_active ? 'نشط' : 'معطل'}</span>
                        </div>
                        {!member.username && (
                          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200/70 px-2.5 py-1.5 rounded-lg font-medium">
                            لم يتم تعيين اسم مستخدم
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleEdit(member)}
                          className="flex-1 flex items-center justify-center gap-2 bg-white border border-[#DFEAF0] text-[#087F8C] py-2.5 rounded-xl text-xs font-bold hover:border-[#087F8C] hover:bg-[#087F8C]/5 transition-colors cursor-pointer"
                        >
                          <Edit2 size={15} />
                          تعديل
                        </button>
                        <button
                          onClick={() => handlePasswordChangeStart(member.user_id)}
                          className="flex items-center justify-center gap-2 bg-white border border-[#DFEAF0] text-[#1769AA] py-2.5 px-3.5 rounded-xl text-xs font-bold hover:border-[#1769AA] hover:bg-[#1769AA]/5 transition-colors cursor-pointer"
                          title="تغيير كلمة المرور"
                        >
                          <Key size={15} />
                        </button>
                        {!isCurrentUser && (
                          <>
                            <button
                              onClick={() => handleToggleActive(member)}
                              className={`flex items-center justify-center gap-2 py-2.5 px-3.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                                member.is_active 
                                  ? 'bg-amber-50 border-amber-200/80 text-amber-700 hover:bg-amber-100' 
                                  : 'bg-emerald-50 border-emerald-200/80 text-emerald-700 hover:bg-emerald-100'
                              }`}
                              title={member.is_active ? 'تعطيل الحساب' : 'تفعيل الحساب'}
                            >
                              <Power size={15} />
                            </button>
                            <button
                              onClick={() => handleDeleteConfirm(member.user_id)}
                              className="flex items-center justify-center gap-2 bg-red-50 border border-red-200/80 text-red-600 py-2.5 px-3.5 rounded-xl text-xs font-bold hover:bg-red-100 transition-colors cursor-pointer"
                            >
                              <Trash2 size={15} />
                            </button>
                          </>
                        )}
                      </div>
                      
                      {/* Password Change Modal */}
                      {passwordChangeId === member.user_id && (
                        <div className="mt-4 p-4 bg-white rounded-xl border border-[#DFEAF0] space-y-3 shadow-xs">
                          <div className="flex items-center gap-2 text-[#1769AA] font-black text-sm">
                            <Lock size={16} />
                            <span>تغيير كلمة المرور</span>
                          </div>
                          <div>
                            <label className="text-xs font-bold text-[#718394] mb-1 block">كلمة المرور الجديدة</label>
                            <div className="relative">
                              <input
                                type={showNewPassword ? 'text' : 'password'}
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                className={`${inputClass} pl-11`}
                                placeholder="كلمة المرور الجديدة (6 أحرف على الأقل)"
                              />
                              <button
                                type="button"
                                onClick={() => setShowNewPassword(prev => !prev)}
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#718394] hover:text-[#172B3A] transition-colors cursor-pointer"
                                aria-label={showNewPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                                title={showNewPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                              >
                                {showNewPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                              </button>
                            </div>
                          </div>
                          <div>
                            <label className="text-xs font-bold text-[#718394] mb-1 block">تأكيد كلمة المرور</label>
                            <div className="relative">
                              <input
                                type={showConfirmPassword ? 'text' : 'password'}
                                value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                                className={`${inputClass} pl-11`}
                                placeholder="أعد كتابة كلمة المرور"
                              />
                              <button
                                type="button"
                                onClick={() => setShowConfirmPassword(prev => !prev)}
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#718394] hover:text-[#172B3A] transition-colors cursor-pointer"
                                aria-label={showConfirmPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                                title={showConfirmPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                              >
                                {showConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                              </button>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handlePasswordChange(member.user_id)}
                              disabled={changingPassword}
                              className="flex-1 flex items-center justify-center gap-2 fv-btn-primary text-white py-2.5 rounded-xl text-xs font-bold disabled:opacity-50 cursor-pointer"
                            >
                              <Key size={15} />
                              {changingPassword ? 'جاري التغيير...' : 'تغيير كلمة المرور'}
                            </button>
                            <button
                              onClick={handlePasswordChangeCancel}
                              disabled={changingPassword}
                              className="flex items-center justify-center gap-2 bg-[#F5FAFC] border border-[#DFEAF0] text-[#718394] py-2.5 px-4 rounded-xl text-xs font-bold hover:text-[#172B3A] transition-colors cursor-pointer"
                            >
                              <X size={15} />
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}