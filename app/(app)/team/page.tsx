'use client';

import { useState } from 'react';
import { useUserRole, UserRole } from '@/lib/RoleContext';

export default function TeamManagementPage() {
  const { role, isOwner, staffMembers, addStaffMember, removeStaffMember, loadingStaff } = useUserRole();
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [branch, setBranch] = useState('Main Branch');
  const [memberRole, setMemberRole] = useState<UserRole>('employee');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOwner) {
    return (
      <div className="max-w-xl mx-auto text-center py-16 bg-white rounded-2xl border border-border p-8 mt-10">
        <div className="w-14 h-14 bg-purple-50 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
          🔒
        </div>
        <h1 className="text-xl font-bold text-textPrimary mb-2">Owner Access Required</h1>
        <p className="text-sm text-textSecondary">
          Staff and team management is restricted to the Business Owner. Cashiers and accountants do not have permission to view or manage team rosters.
        </p>
      </div>
    );
  }

  const employeeCount = staffMembers.filter((m) => m.role === 'employee').length;
  const accountantCount = staffMembers.filter((m) => m.role === 'accountant').length;

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setMsg({ type: 'error', text: 'Name and email are required.' });
      return;
    }

    setSubmitting(true);
    setMsg(null);
    const res = await addStaffMember(name, email, memberRole, phone, branch);
    setSubmitting(false);

    if (res.success) {
      setName('');
      setEmail('');
      setPhone('');
      setShowAddModal(false);
      setMsg({ type: 'success', text: `Staff member ${name} recorded successfully.` });
    } else {
      setMsg({ type: 'error', text: res.error || 'Failed to add staff.' });
    }
  };

  const handleRemove = async (id: string, memberName: string) => {
    if (confirm(`Are you sure you want to remove ${memberName} from your team?`)) {
      await removeStaffMember(id);
      setMsg({ type: 'success', text: `${memberName} has been removed.` });
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-textPrimary">Staff &amp; Team Management</h1>
          <p className="text-sm text-textSecondary">
            Record cashiers, attendants, and CPAs. Grant role-specific permissions so sensitive owner equity stays protected.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-textPrimary text-white font-semibold text-sm px-4 py-2.5 rounded-xl hover:opacity-90 transition flex items-center gap-2 self-start sm:self-auto"
        >
          <span>+</span> Record Staff Member
        </button>
      </div>

      {msg && (
        <div
          className={`p-4 rounded-xl text-sm font-medium ${
            msg.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-border">
          <p className="text-xs font-semibold text-textSecondary uppercase">Total Staff Members</p>
          <p className="text-3xl font-extrabold text-textPrimary mt-2">{staffMembers.length}</p>
          <p className="text-xs text-textMuted mt-1">Recorded team directory</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-border">
          <p className="text-xs font-semibold text-purple-700 uppercase">Cashiers &amp; Shop Attendants</p>
          <p className="text-3xl font-extrabold text-purple-700 mt-2">{employeeCount}</p>
          <p className="text-xs text-textMuted mt-1">POS &amp; Stock access only</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-border">
          <p className="text-xs font-semibold text-blue-700 uppercase">CPAs &amp; Accountants</p>
          <p className="text-3xl font-extrabold text-blue-700 mt-2">{accountantCount}</p>
          <p className="text-xs text-textMuted mt-1">Audit, P&amp;L &amp; Tax filing</p>
        </div>
      </div>

      {/* Staff Members Table */}
      <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-xs">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-base font-bold text-textPrimary">Team Member Directory ({staffMembers.length})</h2>
          <span className="text-xs text-textSecondary">Active multi-user authorization</span>
        </div>

        {staffMembers.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3 text-xl">👥</div>
            <h3 className="text-sm font-bold text-textPrimary mb-1">No Staff Members Recorded Yet</h3>
            <p className="text-xs text-textSecondary max-w-sm mx-auto mb-4">
              Click &quot;Record Staff Member&quot; above to add your cashiers or external accountants with tailored role permissions.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="text-xs font-bold text-accentText bg-accentBg px-3 py-1.5 rounded-lg hover:bg-gray-200"
            >
              + Add First Member
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b border-border text-xs uppercase text-textSecondary">
                <tr>
                  <th className="px-6 py-3 font-semibold">Staff Name &amp; Email</th>
                  <th className="px-6 py-3 font-semibold">Assigned Role</th>
                  <th className="px-6 py-3 font-semibold">Branch</th>
                  <th className="px-6 py-3 font-semibold">Permissions</th>
                  <th className="px-6 py-3 font-semibold">Date Added</th>
                  <th className="px-6 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {staffMembers.map((member) => {
                  const isEmp = member.role === 'employee';
                  return (
                    <tr key={member.id} className="hover:bg-gray-50/50">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-textPrimary">{member.name}</div>
                        <div className="text-xs text-textSecondary">{member.email}</div>
                        {member.phone && <div className="text-[11px] text-textMuted">{member.phone}</div>}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${
                            isEmp ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}
                        >
                          {isEmp ? '🧑‍💼 Employee / Cashier' : '💼 CPA / Accountant'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-textSecondary">{member.branch || 'Main Branch'}</td>
                      <td className="px-6 py-4 text-xs text-textSecondary">
                        {isEmp ? (
                          <span className="text-purple-900 font-medium">✓ POS · ✓ Stock · 🔒 P&amp;L Hidden</span>
                        ) : (
                          <span className="text-blue-900 font-medium">✓ Audit Hub · ✓ IFRS · ✓ GRA Tax</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs text-textMuted">
                        {member.created_at ? member.created_at.slice(0, 10) : 'Active'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleRemove(member.id, member.name)}
                          className="text-xs font-semibold text-danger hover:underline"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Staff Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-textPrimary">Record New Staff Member</h3>
              <button onClick={() => setShowAddModal(false)} className="text-textMuted hover:text-textPrimary text-xl font-bold">
                ×
              </button>
            </div>

            <form onSubmit={handleAddMember} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-textSecondary mb-1">Staff Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Kwame Mensah"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:border-textPrimary"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-textSecondary mb-1">Work Email</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. kwame@business.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:border-textPrimary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-textSecondary mb-1">Phone (Optional)</label>
                  <input
                    type="tel"
                    placeholder="e.g. 0244 123 456"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full border border-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:border-textPrimary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-textSecondary mb-1">Assigned Branch</label>
                  <input
                    type="text"
                    placeholder="e.g. Accra Mall Branch"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="w-full border border-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:border-textPrimary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-textSecondary mb-1.5">Assign Role &amp; Permissions</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMemberRole('employee')}
                    className={`p-3 rounded-xl border text-left transition ${
                      memberRole === 'employee'
                        ? 'bg-purple-50 text-purple-900 border-purple-500 ring-1 ring-purple-500'
                        : 'bg-surface2 text-textSecondary border-border hover:bg-gray-100'
                    }`}
                  >
                    <p className="text-xs font-bold">🧑‍💼 Employee / Cashier</p>
                    <p className="text-[10px] text-textMuted mt-1">POS, stock &amp; bills. Financials hidden.</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMemberRole('accountant')}
                    className={`p-3 rounded-xl border text-left transition ${
                      memberRole === 'accountant'
                        ? 'bg-blue-50 text-blue-900 border-blue-500 ring-1 ring-blue-500'
                        : 'bg-surface2 text-textSecondary border-border hover:bg-gray-100'
                    }`}
                  >
                    <p className="text-xs font-bold">💼 CPA / Accountant</p>
                    <p className="text-[10px] text-textMuted mt-1">Audit Hub, Balance Sheet &amp; Tax.</p>
                  </button>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 border border-border rounded-xl text-xs font-semibold text-textSecondary hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 bg-textPrimary text-white rounded-xl text-xs font-bold hover:opacity-90 disabled:opacity-50"
                >
                  {submitting ? 'Saving…' : 'Record Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
