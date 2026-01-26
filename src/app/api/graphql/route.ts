import { NextRequest } from "next/server";
import { startServerAndCreateNextHandler } from "@as-integrations/next";
import { ApolloServer } from "@apollo/server";
import { typeDefs } from "@/lib/graphql/schema";
import { resolvers } from "@/lib/graphql/resolvers";
import { getAuthenticatedWallet, isAdminWallet } from "@/lib/auth";

const server = new ApolloServer({
  typeDefs,
  resolvers: resolvers as any,
});

const handler = startServerAndCreateNextHandler<NextRequest>(server, {
  context: async (req) => {
    const wallet = await getAuthenticatedWallet(req);
    const isAuthenticated = !!wallet;

    // Construct user object from wallet
    const user = wallet ? {
      userId: wallet,
      email: "", // Not available from wallet-only auth
      roles: isAdminWallet(wallet) ? ["admin"] : [],
      wallet: wallet
    } : undefined;

    const hasRole = (role: string | string[]) => {
      if (!user) return false;
      if (user.roles?.includes("admin") || user.roles?.includes("Super Admin")) return true;
      const roles = Array.isArray(role) ? role : [role];
      return roles.some(r => user.roles?.includes(r));
    };
    const hasPermission = hasRole; // Simplify for now

    return {
      req,
      user,
      isAuthenticated,
      hasRole,
      hasPermission
    };
  },
});

export async function GET(request: NextRequest, _context: { params: Promise<{}> }) {
  return handler(request);
}

export async function POST(request: NextRequest, _context: { params: Promise<{}> }) {
  return handler(request);
}
