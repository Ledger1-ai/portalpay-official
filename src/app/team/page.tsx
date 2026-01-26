"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Search,
  MoreHorizontal,
  Edit,
  Trash2,
  Key,
  Shield,
  ShieldCheck,
  AlertCircle,
  Copy,
  CheckCircle,
} from "lucide-react";
import { toast } from "sonner";

interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  twoFactorEnabled: boolean;
  isFirstLogin: boolean;
  mustChangePassword: boolean;
  lastLogin?: string;
  createdAt: string;
  createdBy?: {
    name: string;
    email: string;
  };
  toastGuid?: string;
  onTimeRate?: number;
}

interface TimeEntry {
  guid: string;
  inDate: string;
  outDate: string;
  employeeReference: {
    guid: string;
  };
  shiftReference?: {
    guid: string;
    scheduledInTime: string;
  };
}


interface CreateUserData {
  name: string;
  email: string;
  role: string;
  permissions?: string[];
  isActive: boolean;
  mustChangePassword: boolean;
}

export default function TeamManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [showTempPassword, setShowTempPassword] = useState(false);

  const [newUser, setNewUser] = useState<CreateUserData>({
    name: "",
    email: "",
    role: "Staff",
    isActive: true,
    mustChangePassword: true,
  });

  // Fetch users
  const fetchUsers = async () => {
    try {
      const token = sessionStorage.getItem('accessToken');
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      const response = await fetch(`/api/team?${params.toString()}` , {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setUsers(data.data.users);
        fetchOnTimeRates(data.data.users);
      } else {
        throw new Error('Failed to fetch users');
      }
    } catch {
      toast.error("Error", {
        description: "Failed to fetch team members",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchOnTimeRates = async (userList: User[]) => {
    const usersWithRates = await Promise.all(userList.map(async user => {
      try {
        const response = await fetch(`/api/team/on-time-rate?userId=${user._id}`);
        if (response.ok) {
          const data = await response.json();
          return { ...user, onTimeRate: data.onTimeRate };
        }
      } catch (error) {
        console.error(`Failed to fetch on-time rate for user ${user._id}:`, error);
      }
      return { ...user, onTimeRate: null };
    }));
    setUsers(usersWithRates);
  };

  useEffect(() => {
    fetchUsers();
  }, [statusFilter]);

  // Create user
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = sessionStorage.getItem('accessToken');
      const response = await fetch('/api/team', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(newUser),
      });

      const data = await response.json();
      
      if (response.ok) {
        setUsers([data.data.user, ...users]);
        setTemporaryPassword(data.data.temporaryPassword);
        setShowTempPassword(true);
        setIsCreateDialogOpen(false);
        setNewUser({
          name: "",
          email: "",
          role: "Staff",
          isActive: true,
          mustChangePassword: true,
        });
        toast.success("Success", {
          description: "Team member created successfully",
        });
      } else {
        throw new Error(data.error || 'Failed to create user');
      }
    } catch (error) {
      toast.error("Error", {
        description: error instanceof Error ? error.message : "Failed to create team member",
      });
    }
  };

  // Update user
  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    try {
      const token = sessionStorage.getItem('accessToken');
      const response = await fetch('/api/team', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: selectedUser._id,
          name: selectedUser.name,
          email: selectedUser.email,
          role: selectedUser.role,
          isActive: selectedUser.isActive,
        }),
      });

      const data = await response.json();
      
      if (response.ok) {
        setUsers(users.map(user => 
          user._id === selectedUser._id ? data.data.user : user
        ));
        setIsEditDialogOpen(false);
        setSelectedUser(null);
        toast.success("Success", {
          description: "Team member updated successfully",
        });
      } else {
        throw new Error(data.error || 'Failed to update user');
      }
    } catch (error) {
      toast.error("Error", {
        description: error instanceof Error ? error.message : "Failed to update team member",
      });
    }
  };

  // Reset password
  const handleResetPassword = async (userId: string) => {
    try {
      const token = sessionStorage.getItem('accessToken');
      const response = await fetch(`/api/team/${userId}/reset-password`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();
      
      if (response.ok) {
        setTemporaryPassword(data.data.temporaryPassword);
        setShowTempPassword(true);
        toast.success("Success", {
          description: "Password reset successfully",
        });
      } else {
        throw new Error(data.error || 'Failed to reset password');
      }
    } catch (error) {
      toast.error("Error", {
        description: error instanceof Error ? error.message : "Failed to reset password",
      });
    }
  };

  // Deactivate user
  const handleDeactivateUser = async (userId: string) => {
    try {
      const token = sessionStorage.getItem('accessToken');
      const response = await fetch(`/api/team?id=${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        setUsers(users.map(user => 
          user._id === userId ? { ...user, isActive: false } : user
        ));
        toast.success("Success", {
          description: "Team member deactivated successfully",
        });
      } else {
        const data = await response.json();
        throw new Error(data.error || 'Failed to deactivate user');
      }
    } catch (error) {
      toast.error("Error", {
        description: error instanceof Error ? error.message : "Failed to deactivate team member",
      });
    }
  };

  // Copy password to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied", {
      description: "Password copied to clipboard",
    });
  };

  // Filter users
  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = !roleFilter || user.role === roleFilter;
    const matchesStatus = !statusFilter || 
                         (statusFilter === 'active' && user.isActive) ||
                         (statusFilter === 'inactive' && !user.isActive);
    
    return matchesSearch && matchesRole && matchesStatus;
  });

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'Super Admin': return 'bg-red-100 text-red-800';
      case 'Manager': return 'bg-blue-100 text-blue-800';
      case 'Shift Supervisor': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusBadgeColor = (isActive: boolean) => {
    return isActive 
      ? 'bg-green-100 text-green-800' 
      : 'bg-red-100 text-red-800';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Team Management</h1>
          <p className="text-gray-600">Manage team members, roles, and permissions</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Team Member
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add New Team Member</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Name</label>
                <Input
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Email</label>
                <Input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Role</label>
                <Select 
                  value={newUser.role} 
                  onValueChange={(value) => setNewUser({ ...newUser, role: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Staff">Staff</SelectItem>
                    <SelectItem value="Shift Supervisor">Shift Supervisor</SelectItem>
                    <SelectItem value="Manager">Manager</SelectItem>
                    <SelectItem value="Super Admin">Super Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-4">
                <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Create User</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search team members..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={roleFilter || "all"} onValueChange={(v) => setRoleFilter(v === "all" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="Staff">Staff</SelectItem>
                <SelectItem value="Shift Supervisor">Shift Supervisor</SelectItem>
                <SelectItem value="Manager">Manager</SelectItem>
                <SelectItem value="Super Admin">Super Admin</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={fetchUsers}>
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Team Members Table */}
      <Card>
        <CardHeader>
          <CardTitle>Team Members ({filteredUsers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>2FA</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead>On-Time Rate</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow key={user._id}>
                  <TableCell className="font-medium">
                    <div>
                      <div>{user.name}</div>
                      {(user.isFirstLogin || user.mustChangePassword) && (
                        <div className="flex items-center text-amber-600 text-sm">
                          <AlertCircle className="w-3 h-3 mr-1" />
                          {user.isFirstLogin ? 'First login' : 'Password change required'}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge className={getRoleBadgeColor(user.role)}>
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={getStatusBadgeColor(user.isActive)}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {user.twoFactorEnabled ? (
                      <ShieldCheck className="w-4 h-4 text-green-600" />
                    ) : (
                      <Shield className="w-4 h-4 text-gray-400" />
                    )}
                  </TableCell>
                  <TableCell>
                    {user.lastLogin 
                      ? new Date(user.lastLogin).toLocaleDateString()
                      : 'Never'
                    }
                  </TableCell>
                  <TableCell>
                    {user.onTimeRate === undefined ? (
                      <span className="text-gray-400">Loading...</span>
                    ) : user.onTimeRate === -1 ? (
                      <span className="text-gray-500">N/A</span>
                    ) : (
                      <span className={`${user.onTimeRate >= 90 ? 'text-green-600' : user.onTimeRate >= 70 ? 'text-orange-500' : 'text-red-600'}`}>
                        {user.onTimeRate}%
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedUser(user);
                            setIsEditDialogOpen(true);
                          }}
                        >
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleResetPassword(user._id)}
                        >
                          <Key className="mr-2 h-4 w-4" />
                          Reset Password
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleDeactivateUser(user._id)}
                          className="text-red-600"
                          disabled={!user.isActive}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Deactivate
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit User Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Team Member</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <form onSubmit={handleUpdateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Name</label>
                <Input
                  value={selectedUser.name}
                  onChange={(e) => setSelectedUser({ ...selectedUser, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Email</label>
                <Input
                  type="email"
                  value={selectedUser.email}
                  onChange={(e) => setSelectedUser({ ...selectedUser, email: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Role</label>
                <Select 
                  value={selectedUser.role} 
                  onValueChange={(value) => setSelectedUser({ ...selectedUser, role: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Staff">Staff</SelectItem>
                    <SelectItem value="Shift Supervisor">Shift Supervisor</SelectItem>
                    <SelectItem value="Manager">Manager</SelectItem>
                    <SelectItem value="Super Admin">Super Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-4">
                <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Update User</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Temporary Password Dialog */}
      <Dialog open={showTempPassword} onOpenChange={setShowTempPassword}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Temporary Password Generated</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              A temporary password has been generated. Please share this securely with the user.
            </p>
            <div className="flex items-center space-x-2 p-3 bg-gray-100 rounded-lg">
              <code className="flex-1 text-sm font-mono">{temporaryPassword}</code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyToClipboard(temporaryPassword)}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-amber-600">
              ⚠️ The user will be required to change this password on first login.
            </p>
            <Button className="w-full" onClick={() => setShowTempPassword(false)}>
              <CheckCircle className="w-4 h-4 mr-2" />
              Got it
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
} 