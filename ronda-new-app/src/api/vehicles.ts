/**
 * Vehicles API
 * Handles vehicle endpoints
 */
import { apiClient } from './client';
import { Vehicle, PaginatedResponse } from '../types';

export const vehiclesApi = {
  /**
   * List vehicles for current user's branch
   */
  async list(branchId?: number): Promise<PaginatedResponse<Vehicle>> {
    const url = branchId ? `/vehicles/?branch_id=${branchId}` : '/vehicles/';
    const response = await apiClient.get<PaginatedResponse<Vehicle>>(url);
    return response.data;
  },

  /**
   * Get vehicle by ID
   */
  async get(vehicleId: number): Promise<Vehicle> {
    const response = await apiClient.get<Vehicle>(`/vehicles/${vehicleId}/`);
    return response.data;
  },
};
