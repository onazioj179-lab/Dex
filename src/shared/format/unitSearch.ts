// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Unit-query resolution for the Unit Converter (DEX v6 Track G). Maps an
 * informal typed query ("km", "pounds", "MB", "kwh") to a category + unit index
 * in the converter's catalog, so users can jump straight to a unit instead of
 * hunting tabs and dropdowns. Pure + unit-tested; decoupled from the catalog by
 * taking it as a parameter.
 */

export interface UnitLike {
  label: string;
  symbol: string;
}

export interface UnitMatch {
  category: string;
  index: number;
}

// Informal names -> the catalog symbol, compacted (lowercased, spaces/degree
// stripped). Lets "pounds" find "lb", "kilometre" find "km", etc.
const ALIASES: Record<string, string> = {
  // length
  meter: 'm', metre: 'm', meters: 'm', metres: 'm',
  kilometer: 'km', kilometre: 'km', kilometers: 'km', kilometres: 'km', kms: 'km',
  centimeter: 'cm', centimetre: 'cm', millimeter: 'mm', millimetre: 'mm',
  mile: 'mi', miles: 'mi', foot: 'ft', feet: 'ft', inch: 'in', inches: 'in',
  yard: 'yd', yards: 'yd',
  // weight
  kilogram: 'kg', kilograms: 'kg', kilo: 'kg', kilos: 'kg', kgs: 'kg',
  gram: 'g', grams: 'g', milligram: 'mg', pound: 'lb', pounds: 'lb', lbs: 'lb',
  ounce: 'oz', ounces: 'oz', tonne: 't', tonnes: 't', ton: 't', tons: 't',
  // temperature (compact symbol of "°C" is "c")
  celsius: 'c', centigrade: 'c', fahrenheit: 'f', kelvin: 'k',
  // volume
  liter: 'l', litre: 'l', liters: 'l', litres: 'l', milliliter: 'ml', millilitre: 'ml',
  gallon: 'gal', gallons: 'gal', quart: 'qt', quarts: 'qt', cups: 'cup',
  // speed
  knot: 'kn', knots: 'kn',
  // data
  byte: 'b', bytes: 'b', kilobyte: 'kb', kilobytes: 'kb',
  megabyte: 'mb', megabytes: 'mb', meg: 'mb', megs: 'mb',
  gigabyte: 'gb', gigabytes: 'gb', gig: 'gb', gigs: 'gb',
  terabyte: 'tb', terabytes: 'tb',
  // energy
  joule: 'j', joules: 'j', calorie: 'cal', calories: 'cal',
  kilocalorie: 'kcal', watthour: 'wh', kilowatthour: 'kwh',
};

const norm = (s: string): string => s.trim().toLowerCase();
const compact = (s: string): string => norm(s).replace(/[°\s]/g, '');

/**
 * Resolve a free-text unit query against the catalog. Returns the first match by
 * descending specificity (alias > exact symbol > exact label > label/symbol
 * prefix > label substring), or null when nothing matches.
 */
export function resolveUnitQuery(
  catalog: Record<string, UnitLike[]>,
  query: string,
): UnitMatch | null {
  const q = norm(query);
  if (!q) return null;
  const qc = compact(query);

  const scan = (pred: (u: UnitLike) => boolean): UnitMatch | null => {
    for (const category of Object.keys(catalog)) {
      const units = catalog[category];
      for (let index = 0; index < units.length; index++) {
        if (pred(units[index])) return { category, index };
      }
    }
    return null;
  };

  const aliasSym = ALIASES[q] ?? ALIASES[qc];
  return (
    (aliasSym ? scan(u => compact(u.symbol) === aliasSym) : null) ||
    scan(u => norm(u.symbol) === q || compact(u.symbol) === qc) ||
    scan(u => norm(u.label) === q) ||
    scan(u => norm(u.label).startsWith(q)) ||
    scan(u => compact(u.symbol).startsWith(qc)) ||
    scan(u => norm(u.label).includes(q))
  );
}
