/**
 * Standard fixed-precision formatter for DXF coordinate / length values
 * (group codes 10-39, 40-49, 11-31, etc.). Six decimal places matches
 * AutoCAD's default output and keeps long-decimal artifacts (`12.34000000004`)
 * out of the file.
 */
export const formatCoord = (value: number): string => value.toFixed(6);
