// Inventory feature barrel exports
export { inventoryApi } from './inventoryApi';
export {
  fetchItems,
  createItem,
  updateItem,
  deleteItem,
  adjustStock,
  setSearch,
  setCategoryFilter,
  setLowStockFilter,
  setPage,
  resetInventory,
  resetFormState,
} from './inventorySlice';
export { default as AdjustStockModal } from './AdjustStockModal';
export { default as ItemFormModal } from './ItemFormModal';