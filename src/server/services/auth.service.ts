import { userRepository } from '@/server/repositories/user.repository';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { generateToken } from '@/lib/jwt';
import { RegisterInput, LoginInput } from '@/lib/validations/auth';

export class AuthService {
  /**
   * Register a new user.
   */
  async register(input: RegisterInput) {
    const existingUser = await userRepository.findByEmail(input.email);
    if (existingUser) {
      throw new Error('Email is already registered');
    }

    const passwordHash = await hashPassword(input.password);
    const user = await userRepository.createUser({
      email: input.email,
      name: input.name,
      passwordHash,
    });

    const token = await generateToken({ userId: user.id, email: user.email });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  }

  /**
   * Log in an existing user.
   */
  async login(input: LoginInput) {
    const user = await userRepository.findByEmail(input.email);
    if (!user) {
      throw new Error('Invalid email or password');
    }

    const isPasswordValid = await verifyPassword(input.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new Error('Invalid email or password');
    }

    const token = await generateToken({ userId: user.id, email: user.email });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  }

  /**
   * Get public profile details of a user.
   */
  async getUserProfile(userId: string) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
    };
  }
}

export const authService = new AuthService();
