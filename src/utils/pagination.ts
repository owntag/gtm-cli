/**
 * Pagination utilities
 */

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../config/constants.ts";

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

/**
 * Paginate an array of items
 */
export function paginate<T>(items: T[], options: PaginationOptions = {}): PaginatedResult<T> {
  const page = Math.max(1, options.page || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, options.pageSize || DEFAULT_PAGE_SIZE));

  const totalItems = items.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (page - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);

  return {
    items: items.slice(startIndex, endIndex),
    page,
    pageSize,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

/**
 * Add pagination info to output
 */
export function withPaginationInfo<T>(
  result: PaginatedResult<T>
): { data: T[]; pagination: Omit<PaginatedResult<T>, "items"> } {
  const { items, ...pagination } = result;
  return {
    data: items,
    pagination,
  };
}
