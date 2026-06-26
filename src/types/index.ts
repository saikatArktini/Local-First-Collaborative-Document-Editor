import { Role } from '@prisma/client';

export interface UserDto {
  id: string;
  email: string;
  name: string;
}

export interface DocumentDto {
  id: string;
  title: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthResponse {
  token: string;
  user: UserDto;
}
