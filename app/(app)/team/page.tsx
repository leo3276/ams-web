'use client';

import { useEffect, useState } from 'react';
import { useUserRole, UserRole, StaffMember } from '@/lib/RoleContext';

export default function TeamManagementPage() {
  const {
    role,
    isOwner,
    staffMembers,
    addStaffMember,
    removeStaffMember,
    recordStaffSalaryPayment,
    refreshStaff,
    loadingStaff,
  } = useUserRole();

  useEffect(() => {
    refreshStaff();
  }, [refreshStaff]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [branch, setBranch] = useState('Main Branch');
  const [salary, setSalary] = useState('');
  const [memberRole, setMemberRole] = useState<UserRole>('employee');
  const [submitting, setSubmitting] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
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
  const totalMonthlyPayroll = staffMembers.reduce((acc, m) => acc + (Number(m.salary) || 0), 0);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setMsg({ type: 'error', text: 'Name and email are required.' });
      return;
    }

    const salaryNum = salary.trim() ? parseFloat(salary) : undefined;
    setSubmitting(true);
    setMsg(null);
    const res = await addStaffMember(name, email, memberRole, phone, branch, salaryNum);
    setSubmitting(false);

    if (res.success) {
      setName('');
      setEmail('');
      setPhone('');
      setSalary('');
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

  const handleRecordSalary = async (member: StaffMember) => {
    const salaryAmt = Number(member.salary || 0);
    if (!salaryAmt || salaryAmt <= 0) {
      alert(`Please configure a monthly salary for ${member.name} first.`);
      return;
    }

    if (confirm(`Record GHS ${salaryAmt.toLocaleString()} salary payment for ${member.name} as an Operating Expense?`)) {
      setPayingId(member.id);
      const res = await recordStaffSalaryPayment(member);
      setPayingId(null);

      if (res.success) {
        setMsg({
          type: 'success',
          text: `Salary Payment Logged ✓ GHS ${salaryAmt.toLocaleString()} for ${member.name} has been recorded as an Operating Expense in your ledger and P&L.`,
        });
      } else {
        setMsg({ type: 'error', text: res.error || 'Failed to record salary payment.' });
      }
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-textPrimary">Staff &amp; Payroll Management</h1>
          <p className="text-sm text-textSecondary">
            Record cashiers, attendants, and CPAs. Manage salaries and record monthly wage payments directly as Operating Expenses.
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
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-border">
          <p className="text-xs font-semibold text-textSecondary uppercase">Total Staff Members</p>
          <p className="text-3xl font-extrabold text-textPrimary mt-2">{staffMembers.length}</p>
          <p className="text-xs text-textMuted mt-1">Recorded team directory</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-border">
          <p className="text-xs font-semibold text-purple-700 uppercase">Cashiers / POS</p>
          <p className="text-3xl font-extrabold text-purple-700 mt-2">{employeeCount}</p>
          <p className="text-xs text-textMuted mt-1">POS &amp; Stock lookups</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-border">
          <p className="text-xs font-semibold text-blue-700 uppercase">CPAs &amp; Accountants</p>
          <p className="text-3xl font-extrabold text-blue-700 mt-2">{accountantCount}</p>
          <p className="text-xs text-textMuted mt-1">Audit, P&amp;L &amp; Tax</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-border">
          <p className="text-xs font-semibold text-emerald-700 uppercase">Monthly Payroll</p>
          <p className="text-2xl font-extrabold text-emerald-700 mt-2">GHS {totalMonthlyPayroll.toLocaleString()}</p>
          <p className="text-xs text-textMuted mt-1">Operating Expense</p>
        </div>
      </div>

      {/* Staff Members Table */}
      <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-xs">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-base font-bold text-textPrimary">Team Directory &amp; Payroll ({staffMembers.length})</h2>
          <span className="text-xs text-textSecondary">Active authorization &amp; wage management</span>
        </div>

        {staffMembers.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3 text-xl">👥</div>
            <h3 className="text-sm font-bold text-textPrimary mb-1">No Staff Members Recorded Yet</h3>
            <p className="text-xs text-textSecondary max-w-sm mx-auto mb-4">
              Click &quot;Record Staff Member&quot; above to add cashiers or accountants and configure their monthly salaries.
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
                  <th className="px-6 py-3 font-semibold">Monthly Salary</th>
                  <th className="px-6 py-3 font-semibold">Branch</th>
                  <th className="px-6 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {staffMembers.map((member) => {
                  const isEmp = member.role === 'employee';
                  const memberSalary = Number(member.salary || 0);

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
                      <td className="px-6 py-4">
                        <span className="font-bold text-textPrimary">
                          {memberSalary > 0 ? `GHS ${memberSalary.toLocaleString()}/mo` : '—'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-textSecondary">{member.branch || 'Main Branch'}</td>
                      <td className="px-6 py-4 text-right space-x-3">
                        {memberSalary > 0 && (
                          <button
                            onClick={() => handleRecordSalary(member)}
                            disabled={payingId === member.id}
                            className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition"
                          >
                            {payingId === member.id ? 'Recording…' : '💰 Record Salary (Expense)'}
                          </button>
                        )}
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
                  placeholder="e.g. Kwame Mensah (Cashier)"
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

              <div>
                <label className="block text-xs font-bold text-textSecondary mb-1">Monthly Salary (GHS)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 1500 (Auto logged as Operating Expense)"
                  value={salary}
                  onChange={(e) => setSalary(e.target.value)}
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
                    placeholder="e.g. Accra Central"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="w-full border border-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:border-textPrimary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-textSecondary mb-1">Select Assigned Role</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setMemberRole('employee')}
                    className={`p-3 rounded-xl border text-left transition ${
                      memberRole === 'employee' ? 'border-textPrimary bg-gray-50' : 'border-border'
                    }`}
                  >
                    <div className="font-bold text-xs text-textPrimary">🧑‍💼 Cashier / POS</div>
                    <div className="text-[11px] text-textSecondary mt-0.5">Sales &amp; stock only. Profits hidden.</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMemberRole('accountant')}
                    className={`p-3 rounded-xl border text-left transition ${
                      memberRole === 'accountant' ? 'border-textPrimary bg-gray-50' : 'border-border'
                    }`}
                  >
                    <div className="font-bold text-xs text-textPrimary">💼 CPA / Accountant</div>
                    <div className="text-[11px] text-textSecondary mt-0.5">Audit hub, P&amp;L &amp; GRA tax.</div>
                  </button>
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-border text-xs font-bold text-textSecondary hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl bg-textPrimary text-white text-xs font-bold hover:opacity-90 transition disabled:opacity-50"
                >
                  {submitting ? 'Saving…' : 'Save Staff Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
