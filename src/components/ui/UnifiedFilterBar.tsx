import React from 'react';
import { classNames } from '@/utils/classNames';
import { TabStrip, type TabStripItem } from './TabStrip';
interface UnifiedFilterBarProps {
    searchSlot?: React.ReactNode;
    filters?: React.ReactNode[];
    actionsSlot?: React.ReactNode;
    activeFiltersSlot?: React.ReactNode;
    resultsLabel?: React.ReactNode;
    className?: string;
    dense?: boolean;
    filtersClassName?: string;
    actionsClassName?: string;
}
interface FilterFieldProps {
    label?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    search?: boolean;
    note?: React.ReactNode;
}
interface FilterSearchFieldProps {
    label: React.ReactNode;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    inputClassName?: string;
    icon?: React.ReactNode;
    dir?: 'rtl' | 'ltr';
    disabled?: boolean;
    ariaLabel?: string;
}
interface FilterSelectFieldProps {
    label: React.ReactNode;
    value: string;
    onChange: (value: string) => void;
    options: Array<{
        value: string;
        label: string;
        disabled?: boolean;
    }>;
    className?: string;
    selectClassName?: string;
    disabled?: boolean;
    ariaLabel?: string;
}
interface FilterTextFieldProps {
    label: React.ReactNode;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    inputClassName?: string;
    disabled?: boolean;
    ltr?: boolean;
    list?: string;
    type?: 'text' | 'tel' | 'search';
    ariaLabel?: string;
}
interface FilterDateFieldProps {
    label: React.ReactNode;
    value: string;
    onChange: (value: string) => void;
    className?: string;
    inputClassName?: string;
    disabled?: boolean;
    ariaLabel?: string;
}
interface FilterRangeFieldProps {
    label: React.ReactNode;
    startLabel: React.ReactNode;
    endLabel: React.ReactNode;
    startControl: React.ReactNode;
    endControl: React.ReactNode;
    className?: string;
    note?: React.ReactNode;
}
const resolveAriaLabel = (label: React.ReactNode, override?: string) => {
    if (override)
        return override;
    return typeof label === 'string' ? label : undefined;
};
interface ActiveFilterChipProps {
    label: React.ReactNode;
    onClear?: () => void;
    className?: string;
}
interface FilterSegmentedControlProps {
    label?: React.ReactNode;
    items: TabStripItem[];
    className?: string;
}
export const FilterField: React.FC<FilterFieldProps> = ({ label, children, className, search = false, note }) => (<div className={classNames('wk-filter-field', search && 'wk-filter-field--search', className)}>
    {label ? <span className="wk-field-label wk-filter-field__label">{label}</span> : null}
    <div className="wk-filter-field__control">{children}</div>
    {note ? <span className="wk-lock-hint mt-2">{note}</span> : null}
  </div>);
export const FilterSearchField: React.FC<FilterSearchFieldProps> = ({ label, value, onChange, placeholder, className, inputClassName, icon, dir = 'rtl', disabled = false, ariaLabel }) => (<FilterField label={label} className={className} search>
    <div className="wk-control-affix-shell">
      {icon ? (<span className="wk-control-affix wk-control-affix--inline-left">
          {icon}
        </span>) : null}
      <input type="text" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} disabled={disabled} dir={dir} aria-label={resolveAriaLabel(label, ariaLabel)} className={classNames('wk-input h-12 text-sm font-bold', dir === 'ltr' && 'wk-input--ltr', Boolean(icon) && 'wk-input--with-inline-left-affix', inputClassName)}/>
    </div>
  </FilterField>);
export const FilterSelectField: React.FC<FilterSelectFieldProps> = ({ label, value, onChange, options, className, selectClassName, disabled = false, ariaLabel }) => (<FilterField label={label} className={className}>
    <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} aria-label={resolveAriaLabel(label, ariaLabel)} className={classNames('wk-select', selectClassName)}>
      {options.map((option) => (<option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>))}
    </select>
  </FilterField>);
export const FilterTextField: React.FC<FilterTextFieldProps> = ({ label, value, onChange, placeholder, className, inputClassName, disabled = false, ltr = false, list, type = 'text', ariaLabel }) => (<FilterField label={label} className={className}>
    <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} disabled={disabled} list={list} aria-label={resolveAriaLabel(label, ariaLabel)} className={classNames('wk-input', ltr && 'wk-input--ltr', inputClassName)}/>
  </FilterField>);
export const FilterDateField: React.FC<FilterDateFieldProps> = ({ label, value, onChange, className, inputClassName, disabled = false, ariaLabel }) => (<FilterField label={label} className={className}>
    <input type="date" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} aria-label={resolveAriaLabel(label, ariaLabel)} className={classNames('wk-input wk-date-input', inputClassName)}/>
  </FilterField>);
export const FilterRangeField: React.FC<FilterRangeFieldProps> = ({ label, startLabel, endLabel, startControl, endControl, className, note }) => (<FilterField label={label} className={classNames('wk-filter-field--range', className)} note={note}>
    <div className="wk-filter-range" role="group" aria-label={typeof label === 'string' ? label : undefined}>
      <div className="wk-filter-range__segment">
        <span className="wk-filter-range__segment-label">{startLabel}</span>
        <div className="wk-filter-range__segment-control">{startControl}</div>
      </div>
      <div className="wk-filter-range__segment">
        <span className="wk-filter-range__segment-label">{endLabel}</span>
        <div className="wk-filter-range__segment-control">{endControl}</div>
      </div>
    </div>
  </FilterField>);
export const ActiveFilterChip: React.FC<ActiveFilterChipProps> = ({ label, onClear, className }) => onClear ? (<button type="button" onClick={onClear} className={classNames('wk-filter-chip', className)}>
      <span>{label}</span>
      <span aria-hidden="true">{'\u00d7'}</span>
    </button>) : (<span className={classNames('wk-filter-chip', className)}>
      <span>{label}</span>
    </span>);
export const FilterSegmentedControl: React.FC<FilterSegmentedControlProps> = ({ label, items, className }) => (<FilterField label={label} className={className}>
    <TabStrip items={items} compact className="w-full" ariaLabel={typeof label === 'string' ? label : 'filter'}/>
  </FilterField>);
export const LockHint: React.FC<{
    children: React.ReactNode;
    className?: string;
}> = ({ children, className }) => <p className={classNames('wk-lock-hint', className)}>{children}</p>;
export const UnifiedFilterBar: React.FC<UnifiedFilterBarProps> = ({ searchSlot, filters = [], actionsSlot, activeFiltersSlot, resultsLabel, className, dense = false, filtersClassName, actionsClassName }) => (<section className={classNames('wk-flat-card wk-filter-bar', dense ? 'wk-filter-bar--dense p-3' : 'p-3 md:p-4', className)} data-density={dense ? 'dense' : 'default'}>
    <div className="wk-filter-bar__stack">
      {searchSlot ? <div className="wk-filter-bar__search">{searchSlot}</div> : null}

      {(filters.length > 0 || actionsSlot) ? (<div className="wk-filter-bar__controls">
          {actionsSlot ? <div className={classNames('wk-filter-bar__actions', actionsClassName)}>{actionsSlot}</div> : null}

          {filters.length > 0 ? (<div className={classNames('wk-filter-bar__grid', filtersClassName)}>
              {filters.map((filterNode, index) => (<div key={index} className="min-w-0">
                  {filterNode}
                </div>))}
            </div>) : null}
        </div>) : null}

      {(resultsLabel || activeFiltersSlot) ? (<div className="wk-filter-bar__footer">
          {resultsLabel ? (<div className="wk-filter-bar__results wk-meta-text text-neutral-500">{resultsLabel}</div>) : null}
          {activeFiltersSlot ? <div className="wk-filter-bar__chips">{activeFiltersSlot}</div> : null}
        </div>) : null}
    </div>
  </section>);
