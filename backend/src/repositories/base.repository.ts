/**
 * ============================================================================
 * VeriVote Kenya - Base Repository
 * ============================================================================
 * 
 * This is an abstract base class that provides common functionality for all
 * repositories. It implements the Repository Pattern.
 * 
 * WHAT IS THE REPOSITORY PATTERN?
 * -------------------------------
 * The Repository Pattern separates data access logic from business logic:
 * 
 *   Route Handler (HTTP)  →  Repository (Data)  →  Database
 *        |                      |                     |
 *   "Give me voters"     "Build query"      "Execute SQL"
 *        |                      |                     |
 *   Handles HTTP          Handles data        Stores data
 *   request/response      access logic        
 * 
 * BENEFITS:
 * ---------
 * 1. Separation of concerns - routes don't know about Prisma
 * 2. Reusability - same method can be used in multiple routes
 * 3. Testability - easy to mock repositories in unit tests
 * 4. Consistency - all data access follows the same patterns
 * 
 * ============================================================================
 */

import type { PaginationParams, PaginatedResponse } from '../types/database.types.js';

/**
 * Abstract base class for all repositories
 * 
 * Type Parameters:
 * - T: The entity type (e.g., Voter, Vote)
 * - CreateInput: Type for creating new records
 * - UpdateInput: Type for updating records
 */
export abstract class BaseRepository<T, CreateInput, UpdateInput> {
  // Default pagination settings
  protected defaultLimit = 20;  // Default items per page
  protected maxLimit = 100;     // Maximum items per page (prevents abuse)

  /**
   * Calculate pagination values from request parameters
   * 
   * @param params - Raw pagination parameters from request
   * @returns Sanitized pagination values
   * 
   * Example:
   *   getPagination({ page: 2, limit: 50 })
   *   Returns: { page: 2, limit: 50, skip: 50 }
   * 
   *   getPagination({ page: -1, limit: 9999 })
   *   Returns: { page: 1, limit: 100, skip: 0 }  // Sanitized!
   */
  protected getPagination(params: PaginationParams): {
    page: number;
    limit: number;
    skip: number;
  } {
    // Ensure page is at least 1
    const page = Math.max(1, params.page || 1);
    
    // Ensure limit is between 1 and maxLimit
    const limit = Math.min(
      this.maxLimit,
      Math.max(1, params.limit || this.defaultLimit)
    );
    
    // Calculate how many records to skip
    // Page 1: skip 0, Page 2: skip limit, Page 3: skip 2*limit, etc.
    const skip = (page - 1) * limit;
    
    return { page, limit, skip };
  }

  /**
   * Build a standardized paginated response
   * 
   * @param data - Array of records
   * @param total - Total count in database
   * @param page - Current page number
   * @param limit - Items per page
   * @returns Formatted response with pagination metadata
   */
  protected buildPaginatedResponse<D>(
    data: D[],
    total: number,
    page: number,
    limit: number
  ): PaginatedResponse<D> {
    const totalPages = Math.ceil(total / limit);
    
    return {
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  // ============================================================================
  // ABSTRACT METHODS
  // ============================================================================
  // These must be implemented by child classes
  // The abstract keyword means "no implementation here, subclass must provide"

  /**
   * Find a single record by ID
   * @param id - Record UUID
   */
  abstract findById(id: string): Promise<T | null>;

  /**
   * Find multiple records with pagination
   * @param params - Pagination and filter parameters
   */
  abstract findMany(params?: PaginationParams): Promise<PaginatedResponse<T>>;

  /**
   * Create a new record
   * @param data - Data for the new record
   */
  abstract create(data: CreateInput): Promise<T>;

  /**
   * Update an existing record
   * @param id - Record UUID
   * @param data - Fields to update
   */
  abstract update(id: string, data: UpdateInput): Promise<T>;

  /**
   * Delete a record
   * @param id - Record UUID
   */
  abstract delete(id: string): Promise<T>;

  /**
   * Count total records
   */
  abstract count(): Promise<number>;
}
