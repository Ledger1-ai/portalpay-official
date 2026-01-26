"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2, Eye, EyeOff, Brain, AlertCircle } from "lucide-react";
import Image from "next/image";
import FirstLoginPasswordChange from "@/components/auth/FirstLoginPasswordChange";
import { ROLE_PERMISSIONS } from "@/lib/hooks/use-permissions";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginForm = z.infer<typeof loginSchema>;

interface LoginResponse {
  success: boolean;
  message: string;
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
    permissions: string[];
  };
  accessToken?: string;
  remainingAttempts?: number;
  retryAfter?: number;
  requiresPasswordChange?: boolean;
  isFirstLogin?: boolean;
  tempToken?: string;
}

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
}

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [rateLimitInfo, setRateLimitInfo] = useState<{
    remainingAttempts?: number;
    retryAfter?: number;
  }>({});
  const [passwordChangeData, setPasswordChangeData] = useState<{
    tempToken: string;
    userEmail: string;
    isFirstLogin: boolean;
  } | null>(null);
  useRouter();

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const computeLandingRoute = (user: User): string => {
    const rolePerms = (ROLE_PERMISSIONS as any)[user.role] as string[] | undefined;
    const effective = new Set([...(user.permissions || []), ...((rolePerms || []))]);
    const order: Array<{ perm: string; route: string }> = [
      { perm: "dashboard", route: "/dashboard" },
      { perm: "hostpro", route: "/dashboard/hostpro" },
      { perm: "inventory", route: "/dashboard/inventory" },
      { perm: "menu", route: "/dashboard/menu" },
      { perm: "team", route: "/dashboard/team" },
      { perm: "robotic-fleets", route: "/dashboard/robotic-fleets" },
      { perm: "analytics", route: "/dashboard/analytics" },
      { perm: "scheduling", route: "/dashboard/scheduling" },
      { perm: "roster", route: "/dashboard/roster" },
      { perm: "settings", route: "/dashboard/settings" },
    ];
    for (const item of order) {
      if (effective.has(item.perm)) return item.route;
    }
    return "/dashboard";
  };

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    setErrorMessage("");
    setRateLimitInfo({});
    
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
        credentials: 'include', // Important for cookies
      });

      const result: LoginResponse = await response.json();

      if (result.success && result.user && result.accessToken) {
        // Store access token in memory/state management
        // The refresh token is automatically stored as an httpOnly cookie
        sessionStorage.setItem('accessToken', result.accessToken);
        localStorage.setItem('user', JSON.stringify(result.user));
        
        // Redirect to first allowed route based on permissions
        const landing = computeLandingRoute(result.user as any);
        window.location.href = landing;
      } else if (result.requiresPasswordChange && result.tempToken) {
        // Handle first login or forced password change
        setPasswordChangeData({
          tempToken: result.tempToken,
          userEmail: data.email,
          isFirstLogin: result.isFirstLogin || false
        });
      } else {
        // Handle login failure
        setErrorMessage(result.message || 'Login failed');
        
        // Handle rate limiting
        if (response.status === 429) {
          setRateLimitInfo({
            retryAfter: result.retryAfter
          });
        } else if (result.remainingAttempts !== undefined) {
          setRateLimitInfo({
            remainingAttempts: result.remainingAttempts
          });
        }
      }
    } catch (error) {
      console.error('Login error:', error);
      setErrorMessage('An error occurred during login. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordChangeSuccess = (accessToken: string, user: User) => {
    // Store the new tokens and user data
    sessionStorage.setItem('accessToken', accessToken);
    localStorage.setItem('user', JSON.stringify(user));
    
    // Redirect to first allowed route based on permissions
    const landing = computeLandingRoute(user);
    window.location.href = landing;
  };

  const formatRetryTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return minutes > 0 
      ? `${minutes}m ${remainingSeconds}s`
      : `${remainingSeconds}s`;
  };

  // Show password change component if needed
  if (passwordChangeData) {
    return (
      <FirstLoginPasswordChange
        tempToken={passwordChangeData.tempToken}
        userEmail={passwordChangeData.userEmail}
        isFirstLogin={passwordChangeData.isFirstLogin}
        onSuccess={handlePasswordChangeSuccess}
      />
    );
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden">
      {/* Artistic Teal Gradient Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-teal-400 via-teal-500 to-cyan-500 dark:from-teal-600 dark:via-teal-700 dark:to-cyan-700"></div>

      {/* Moving Teal Orbs */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute w-96 h-96 animate-orb-drift"
          style={{
            background: 'radial-gradient(circle, rgba(20, 184, 166, 0.15), transparent 60%)',
            top: '30%',
            left: '20%'
          }}
        ></div>
        <div
          className="absolute w-80 h-80 animate-orb-drift-reverse"
          style={{
            background: 'radial-gradient(circle, rgba(6, 182, 212, 0.12), transparent 55%)',
            top: '50%',
            right: '25%',
            animationDelay: '15s'
          }}
        ></div>
        <div
          className="absolute w-72 h-72 animate-orb-drift"
          style={{
            background: 'radial-gradient(circle, rgba(16, 185, 129, 0.14), transparent 58%)',
            bottom: '40%',
            left: '40%',
            animationDelay: '30s'
          }}
        ></div>
      </div>
      
      <div className="w-full max-w-md relative z-10">
        {/* Logo and Branding */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <Image
              src="/l1logows.png"
              alt="ledger1"
              width={160}
              height={50}
              className="h-16 w-auto"
            />
          </div>
          <div className="flex items-center justify-center text-sm text-white/70 mb-2 -mt-2 drop-shadow">
            <Brain className="h-4 w-4 mr-1" />
            <span>AI-Assisted Backoffice</span>
          </div>
        </div>

        {/* Login Card */}
        <Card className="backdrop-blur-xl bg-white/20 dark:bg-slate-900/40 border-white/30 dark:border-slate-700/50 shadow-2xl">
          <CardHeader className="space-y-1 pb-4">
            <h2 className="text-2xl font-bold text-center text-white drop-shadow">Welcome Back</h2>
            <p className="text-white/70 text-center text-sm drop-shadow-sm">
              Sign in to your backoffice dashboard
            </p>
          </CardHeader>
          
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {errorMessage && (
                  <div className="flex items-center space-x-2 p-3 text-sm text-red-300 bg-red-900/20 border border-red-500/30 rounded-lg backdrop-blur-sm">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                {rateLimitInfo.retryAfter && (
                  <div className="flex items-center space-x-2 p-3 text-sm text-orange-300 bg-orange-900/20 border border-orange-500/30 rounded-lg backdrop-blur-sm">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span>
                      Too many failed attempts. Please try again in {formatRetryTime(rateLimitInfo.retryAfter)}.
                    </span>
                  </div>
                )}

                {rateLimitInfo.remainingAttempts !== undefined && rateLimitInfo.remainingAttempts < 3 && (
                  <div className="flex items-center space-x-2 p-3 text-sm text-yellow-300 bg-yellow-900/20 border border-yellow-500/30 rounded-lg backdrop-blur-sm">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span>
                      {rateLimitInfo.remainingAttempts} attempt{rateLimitInfo.remainingAttempts !== 1 ? 's' : ''} remaining
                    </span>
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="admin@ledger1.ai"
                          type="email"
                          disabled={isLoading}
                          {...field}
                          className="h-11 bg-white/20 border-white/30 text-white placeholder:text-white/60 backdrop-blur-sm"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            placeholder="Enter your password"
                            type={showPassword ? "text" : "password"}
                            disabled={isLoading}
                            {...field}
                            className="h-11 pr-10 bg-white/20 border-white/30 text-white placeholder:text-white/60 backdrop-blur-sm"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                            onClick={() => setShowPassword(!showPassword)}
                            disabled={isLoading}
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4 text-white/60 hover:text-white" />
                            ) : (
                              <Eye className="h-4 w-4 text-white/60 hover:text-white" />
                            )}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full h-11 bg-teal-600 hover:bg-teal-700 text-white font-medium shadow-lg backdrop-blur-sm"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing In...
                    </>
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
          
          <CardFooter className="flex flex-col space-y-2 text-center text-sm text-white/60">
            <p className="drop-shadow-sm">Forgot your password? Contact your system administrator</p>
            <div className="pt-2 border-t border-white/20">
              <p className="text-xs text-white/50 drop-shadow-sm">
                Demo Login: Use any valid email and password (6+ characters)
              </p>
            </div>
          </CardFooter>
        </Card>

        {/* Footer */}
        <div className="text-center mt-8 text-xs text-white/50 drop-shadow">
          <p>© 2025 ledger1. All rights reserved.</p>
          <p className="mt-1">Visit <a href="https://ledger1.ai" target="_blank" rel="noopener noreferrer" className="underline hover:text-white">ledger1.ai</a> for more information</p>
          <p className="mt-3 text-[10px] text-white/30">An Endeavor of The Utility Co.</p>
        </div>
      </div>
    </div>
  );
} 