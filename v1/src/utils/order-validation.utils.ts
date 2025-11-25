export interface OrderValidationResult {
  formattedSize: string;
  wasAdjusted: boolean;
  originalOrderValue: number;
  finalOrderValue: number;
}

export const validateAndAdjustOrderSize = (
  size: number,
  formattedSize: string,
  price: number,
  minOrderValue: number,
  sizeDecimals: number
): OrderValidationResult => {
  const numericFormattedSize = parseFloat(formattedSize);
  const originalOrderValue = size * price;
  const formattedOrderValue = numericFormattedSize * price;

  if (formattedOrderValue >= minOrderValue) {
    return {
      formattedSize,
      wasAdjusted: false,
      originalOrderValue,
      finalOrderValue: formattedOrderValue
    };
  }

  const adjustedSize = minOrderValue / price;
  const multiplier = Math.pow(10, sizeDecimals);
  const roundedUpSize = Math.ceil(adjustedSize * multiplier) / multiplier;
  const finalFormattedSize = roundedUpSize.toFixed(sizeDecimals);
  const finalOrderValue = parseFloat(finalFormattedSize) * price;

  return {
    formattedSize: finalFormattedSize,
    wasAdjusted: true,
    originalOrderValue,
    finalOrderValue
  };
};
