import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
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

type UserProfileSettings = {
  phone?: string;
  avatar?: string;
};

type AppSettingsRecord = {
  profileName?: string;
  profileEmail?: string;
  profilePhone?: string;
  profileAvatar?: string;
  companyName?: string;
  companyAddress?: string;
  registrationNo?: string;
  napitNo?: string;
  companyPhone?: string;
  companyEmail?: string;
  adminPasswordHash?: string;
  userProfiles?: Record<string, UserProfileSettings>;
};

type UpdateSettingsInput = {
  currentEmail: string;
  profileName: string;
  profileEmail: string;
  profilePhone: string;
  profileAvatar?: string;
  companyName: string;
  companyAddress: string;
  registrationNo: string;
  napitNo: string;
  companyPhone: string;
  companyEmail: string;
};

@Injectable()
export class AuthService {
  constructor(private readonly config: ConfigService) {}

  login(email: string, password: string) {
    const settings = this.readSettings();
    const adminEmail = settings.profileEmail ?? this.config.get<string>("ADMIN_EMAIL") ?? "admin@eelectrics.co.uk";
    const adminPassword = this.config.get<string>("ADMIN_PASSWORD") ?? "admin123";

    const adminPasswordValid = settings.adminPasswordHash
      ? this.verifyPassword(password, settings.adminPasswordHash)
      : password === adminPassword;
    if (email.trim().toLowerCase() === adminEmail.trim().toLowerCase() && adminPasswordValid) {
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
    const settings = this.readSettings();
    return {
      name: settings.profileName ?? "Admin",
      email: settings.profileEmail ?? this.config.get<string>("ADMIN_EMAIL") ?? "admin@eelectrics.co.uk",
      role: "Administrator"
    };
  }

  settings(currentEmail?: string) {
    const appSettings = this.readSettings();
    const normalizedEmail = currentEmail?.trim().toLowerCase();
    const managedUser = normalizedEmail ? this.readUsers().find((item) => item.email === normalizedEmail) : undefined;
    const managedProfile = managedUser ? appSettings.userProfiles?.[managedUser.id] : undefined;

    return {
      profileName: managedUser?.name ?? appSettings.profileName ?? "Admin User",
      profileEmail: managedUser?.email ?? appSettings.profileEmail ?? this.config.get<string>("ADMIN_EMAIL") ?? "admin@eelectrics.co.uk",
      profilePhone: managedProfile?.phone ?? appSettings.profilePhone ?? "0800 999 1452",
      profileAvatar: managedProfile?.avatar ?? appSettings.profileAvatar ?? "",
      companyName: appSettings.companyName ?? "E Electrics Ltd",
      companyAddress: appSettings.companyAddress ?? "57 Beckhampton Road, Bath, BA2 1BL, United Kingdom",
      registrationNo: appSettings.registrationNo ?? "12418331",
      napitNo: appSettings.napitNo ?? "65513",
      companyPhone: appSettings.companyPhone ?? "0800 999 1452",
      companyEmail: appSettings.companyEmail ?? "info@eelectrics.co.uk"
    };
  }

  updateSettings(input: UpdateSettingsInput) {
    const currentEmail = input.currentEmail.trim().toLowerCase();
    const profileName = input.profileName.trim();
    const profileEmail = input.profileEmail.trim().toLowerCase();
    const users = this.readUsers();
    const managedUserIndex = users.findIndex((item) => item.email === currentEmail);
    const appSettings = this.readSettings();

    if (!profileName || !profileEmail || !input.companyName.trim()) {
      throw new BadRequestException("Profile and company details are required");
    }

    const envAdminEmail = (this.config.get<string>("ADMIN_EMAIL") ?? "admin@eelectrics.co.uk").trim().toLowerCase();
    const configuredAdminEmail = (appSettings.profileEmail ?? envAdminEmail).trim().toLowerCase();
    const duplicateManagedUser = users.some((item, index) => index !== managedUserIndex && item.email === profileEmail);
    if (duplicateManagedUser || (managedUserIndex >= 0 && profileEmail === configuredAdminEmail)) {
      throw new ConflictException("This email is already in use");
    }

    if (managedUserIndex >= 0) {
      const managedUser = users[managedUserIndex];
      users[managedUserIndex] = { ...managedUser, name: profileName, email: profileEmail };
      this.writeUsers(users);
      appSettings.userProfiles = {
        ...(appSettings.userProfiles ?? {}),
        [managedUser.id]: {
          phone: input.profilePhone.trim(),
          avatar: input.profileAvatar ?? ""
        }
      };
    } else {
      appSettings.profileName = profileName;
      appSettings.profileEmail = profileEmail;
      appSettings.profilePhone = input.profilePhone.trim();
      appSettings.profileAvatar = input.profileAvatar ?? "";
    }

    Object.assign(appSettings, {
      companyName: input.companyName.trim(),
      companyAddress: input.companyAddress.trim(),
      registrationNo: input.registrationNo.trim(),
      napitNo: input.napitNo.trim(),
      companyPhone: input.companyPhone.trim(),
      companyEmail: input.companyEmail.trim().toLowerCase()
    });
    this.writeSettings(appSettings);
    return this.settings(profileEmail);
  }

  changePassword(input: { currentEmail: string; currentPassword: string; newPassword: string }) {
    if (input.newPassword.length < 6) throw new BadRequestException("New password must be at least 6 characters");
    const email = input.currentEmail.trim().toLowerCase();
    const users = this.readUsers();
    const managedUserIndex = users.findIndex((item) => item.email === email);

    if (managedUserIndex >= 0) {
      const managedUser = users[managedUserIndex];
      if (!this.verifyPassword(input.currentPassword, managedUser.passwordHash)) {
        throw new UnauthorizedException("Current password is incorrect");
      }
      users[managedUserIndex] = { ...managedUser, passwordHash: this.hashPassword(input.newPassword) };
      this.writeUsers(users);
      return { updated: true };
    }

    const appSettings = this.readSettings();
    const configuredPassword = this.config.get<string>("ADMIN_PASSWORD") ?? "admin123";
    const currentPasswordValid = appSettings.adminPasswordHash
      ? this.verifyPassword(input.currentPassword, appSettings.adminPasswordHash)
      : input.currentPassword === configuredPassword;
    if (!currentPasswordValid) throw new UnauthorizedException("Current password is incorrect");
    appSettings.adminPasswordHash = this.hashPassword(input.newPassword);
    this.writeSettings(appSettings);
    return { updated: true };
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

    const adminEmail = (this.readSettings().profileEmail ?? this.config.get<string>("ADMIN_EMAIL") ?? "admin@eelectrics.co.uk").trim().toLowerCase();
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

  private get settingsPath() {
    return join(process.cwd(), "data", "app-settings.json");
  }

  private readSettings(): AppSettingsRecord {
    try {
      const parsed = JSON.parse(readFileSync(this.settingsPath, "utf8"));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as AppSettingsRecord : {};
    } catch {
      return {};
    }
  }

  private writeSettings(settings: AppSettingsRecord) {
    mkdirSync(dirname(this.settingsPath), { recursive: true });
    writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2));
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
