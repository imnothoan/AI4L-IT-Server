/**
 * Utility functions to transform between snake_case (database) and camelCase (TypeScript/Frontend)
 */

/**
 * Convert snake_case string to camelCase
 * Example: 'instructor_id' -> 'instructorId'
 */
export function snakeToCamel(str: string): string {
    return str.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());
}

/**
 * Convert camelCase string to snake_case  
 * Example: 'instructorId' -> 'instructor_id'
 */
export function camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * Transform all keys in an object from snake_case to camelCase
 */
export function transformKeysToCamel<T = any>(obj: any): T {
    if (obj === null || obj === undefined) {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => transformKeysToCamel(item)) as any;
    }

    if (typeof obj === 'object' && obj.constructor === Object) {
        const transformed: any = {};

        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const camelKey = snakeToCamel(key);
                const value = obj[key];

                // Recursively transform nested objects
                if (value && typeof value === 'object') {
                    transformed[camelKey] = transformKeysToCamel(value);
                } else {
                    transformed[camelKey] = value;
                }
            }
        }

        return transformed;
    }

    return obj;
}

/**
 * Transform all keys in an object from camelCase to snake_case
 */
export function transformKeysToSnake<T = any>(obj: any): T {
    if (obj === null || obj === undefined) {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => transformKeysToSnake(item)) as any;
    }

    if (typeof obj === 'object' && obj.constructor === Object) {
        const transformed: any = {};

        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const snakeKey = camelToSnake(key);
                const value = obj[key];

                // Recursively transform nested objects
                if (value && typeof value === 'object') {
                    transformed[snakeKey] = transformKeysToSnake(value);
                } else {
                    transformed[snakeKey] = value;
                }
            }
        }

        return transformed;
    }

    return obj;
}

/**
 * Transform Supabase response to frontend-compatible format
 * This is the main function to use in controllers
 */
export function transformSupabaseResponse<T = any>(data: any): T {
    return transformKeysToCamel<T>(data);
}

/**
 * Transform frontend data to Supabase-compatible format
 * Use this before inserting/updating data
 */
export function transformToSupabaseFormat<T = any>(data: any): T {
    return transformKeysToSnake<T>(data);
}
