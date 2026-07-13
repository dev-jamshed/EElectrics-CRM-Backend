import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";

type ManagedUserRecord = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: string;
};

type PublicUserRecord = {
  id: string;
  name: string;
  email: string;
  status: "Active";
  lastLogin: string;
};

@Injectable()
export class AuthService {
  constructor(private readonly config: ConfigService) {}

  login(email: string, password: string) {
    const adminEmail = this.config.get<string>("ADMIN_EMAIL") ?? "admin@eelectrics.co.uk";
    const adminPassword = this.config.get<string>("ADMIN_PASSWORD") ?? "admin123";

    if (email.trim().toLowerCase() === adminEmail.trim().toLowerCase() && password === adminPassword) {
      return {
        token: this.config.get<string>("AUTH_TOKEN") ?? "modern-crm-local-token",
        user: this.me()
      };
    }

    const managedUser = this.readUsers().find((user) => user.email === email.trim().toLowerCase());
    if (!managedUser || !this.verifyPassword(password, managedUser.passwordHash)) {
      throw new UnauthorizedException("Invalid email or password");
    }

    return {
      token: this.config.get<string>("AUTH_TOKEN") ?? "modern-crm-local-token",
      user: {
        name: managedUser.name,
        email: managedUser.email,
        role: "Administrator"
      }
    };
  }

  me() {
    return {
      name: "Admin",
      email: this.config.get<string>("ADMIN_EMAIL") ?? "admin@eelectrics.co.uk",
      role: "Administrator"
    };
  }

  users(): PublicUserRecord[] {
    return this.readUsers().map((user) => this.toPublicUser(user));
  }

  createUser(input: { name: string; email: string; password: string }) {
    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    if (!name || input.password.length < 6) {
      throw new UnauthorizedException("Invalid user details");
    }

    const adminEmail = (this.config.get<string>("ADMIN_EMAIL") ?? "admin@eelectrics.co.uk").trim().toLowerCase();
    const users = this.readUsers();
    if (email === adminEmail || users.some((user) => user.email === email)) {
      throw new UnauthorizedException("This user already exists");
    }

    const nextUser: ManagedUserRecord = {
      id: randomUUID(),
      name,
      email,
      passwordHash: this.hashPassword(input.password),
      createdAt: new Date().toISOString()
    };
    this.writeUsers([...users, nextUser]);
    return this.toPublicUser(nextUser);
  }

  deleteUser(id: string) {
    const users = this.readUsers();
    this.writeUsers(users.filter((user) => user.id !== id));
    return { id, deleted: users.some((user) => user.id === id) };
  }

  private get usersPath() {
    return join(process.cwd(), "data", "auth-users.json");
  }

  private readUsers(): ManagedUserRecord[] {
    try {
      const parsed = JSON.parse(readFileSync(this.usersPath, "utf8")) as Partial<ManagedUserRecord>[];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((user) => user.id && user.name && user.email && user.passwordHash)
        .map((user) => ({
          id: String(user.id),
          name: String(user.name),
          email: String(user.email).trim().toLowerCase(),
          passwordHash: String(user.passwordHash),
          createdAt: user.createdAt ? String(user.createdAt) : new Date().toISOString()
        }));
    } catch {
      return [];
    }
  }

  private writeUsers(users: ManagedUserRecord[]) {
    mkdirSync(dirname(this.usersPath), { recursive: true });
    writeFileSync(this.usersPath, JSON.stringify(users, null, 2));
  }

  private hashPassword(password: string) {
    const salt = randomUUID();
    const hash = scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${hash}`;
  }

  private verifyPassword(password: string, stored: string) {
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) return false;
    const incoming = Buffer.from(scryptSync(password, salt, 64).toString("hex"), "hex");
    const saved = Buffer.from(hash, "hex");
    return incoming.length === saved.length && timingSafeEqual(incoming, saved);
  }

  private toPublicUser(user: ManagedUserRecord): PublicUserRecord {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      status: "Active",
      lastLogin: "-"
    };
  }
}
