/**
 * DEX Wizard & Multi-Step Form Components
 * Step-by-step form workflows
 */

import React, { useState, useCallback, createContext, useContext, useMemo } from 'react';

// ==================== TYPES ====================

interface Step {
  id: string;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  optional?: boolean;
}

interface WizardContextType {
  currentStep: number;
  steps: Step[];
  data: Record<string, any>;
  isFirstStep: boolean;
  isLastStep: boolean;
  goToStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  updateData: (newData: Record<string, any>) => void;
  resetWizard: () => void;
}

interface WizardProps {
  steps: Step[];
  initialData?: Record<string, any>;
  onComplete?: (data: Record<string, any>) => void;
  onStepChange?: (step: number, data: Record<string, any>) => void;
  children: React.ReactNode;
  showStepper?: boolean;
  allowSkip?: boolean;
}

interface WizardStepProps {
  stepId: string;
  children: React.ReactNode;
  onValidate?: () => boolean | Promise<boolean>;
}

// ==================== WIZARD CONTEXT ====================

const WizardContext = createContext<WizardContextType | null>(null);

export const useWizard = () => {
  const context = useContext(WizardContext);
  if (!context) {
    throw new Error('useWizard must be used within a Wizard');
  }
  return context;
};

// ==================== WIZARD ====================

export const Wizard: React.FC<WizardProps> = ({
  steps,
  initialData = {},
  onComplete,
  onStepChange,
  children,
  showStepper = true,
  allowSkip = false,
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState<Record<string, any>>(initialData);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;

  const goToStep = useCallback((step: number) => {
    if (step >= 0 && step < steps.length) {
      setCurrentStep(step);
      onStepChange?.(step, data);
    }
  }, [steps.length, onStepChange, data]);

  const nextStep = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCompletedSteps((prev) => new Set([...prev, currentStep]));
      goToStep(currentStep + 1);
    } else if (isLastStep) {
      setCompletedSteps((prev) => new Set([...prev, currentStep]));
      onComplete?.(data);
    }
  }, [currentStep, steps.length, isLastStep, goToStep, onComplete, data]);

  const prevStep = useCallback(() => {
    if (currentStep > 0) {
      goToStep(currentStep - 1);
    }
  }, [currentStep, goToStep]);

  const updateData = useCallback((newData: Record<string, any>) => {
    setData((prev) => ({ ...prev, ...newData }));
  }, []);

  const resetWizard = useCallback(() => {
    setCurrentStep(0);
    setData(initialData);
    setCompletedSteps(new Set());
  }, [initialData]);

  const contextValue = useMemo(() => ({
    currentStep,
    steps,
    data,
    isFirstStep,
    isLastStep,
    goToStep,
    nextStep,
    prevStep,
    updateData,
    resetWizard,
  }), [currentStep, steps, data, isFirstStep, isLastStep, goToStep, nextStep, prevStep, updateData, resetWizard]);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      gap: 24,
    },
    stepper: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      position: 'relative',
    },
    stepperLine: {
      position: 'absolute',
      top: 20,
      left: 40,
      right: 40,
      height: 2,
      background: 'var(--color-border)',
    },
    stepperProgress: {
      position: 'absolute',
      top: 20,
      left: 40,
      height: 2,
      background: 'var(--color-accent)',
      transition: 'width 0.3s ease',
    },
    step: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
      zIndex: 1,
      cursor: 'pointer',
    },
    stepCircle: {
      width: 40,
      height: 40,
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 600,
      fontSize: 14,
      transition: 'all 0.2s ease',
    },
    stepLabel: {
      fontSize: 13,
      textAlign: 'center',
      maxWidth: 100,
    },
    content: {
      flex: 1,
    },
  };

  const getStepStyles = (index: number): React.CSSProperties => {
    const isCompleted = completedSteps.has(index);
    const isCurrent = index === currentStep;
    const isAccessible = index <= currentStep || completedSteps.has(index - 1) || allowSkip;

    return {
      ...styles.stepCircle,
      background: isCompleted
        ? 'var(--color-success)'
        : isCurrent
        ? 'var(--color-accent)'
        : 'var(--color-bg-tertiary)',
      color: isCompleted || isCurrent ? 'white' : 'var(--color-text-muted)',
      border: isCurrent ? '2px solid var(--color-accent)' : '2px solid transparent',
      cursor: isAccessible ? 'pointer' : 'not-allowed',
      opacity: isAccessible ? 1 : 0.5,
    };
  };

  const progressWidth = steps.length > 1
    ? `${(currentStep / (steps.length - 1)) * 100}%`
    : '0%';

  return (
    <WizardContext.Provider value={contextValue}>
      <div style={styles.container as any}>
        {showStepper && (
          <div style={styles.stepper as any}>
            <div style={styles.stepperLine as any} />
            <div style={{ ...styles.stepperProgress as any, width: progressWidth }} />
            {steps.map((step, index) => (
              <div
                key={step.id}
                style={styles.step as any}
                onClick={() => {
                  if (index <= currentStep || completedSteps.has(index - 1) || allowSkip) {
                    goToStep(index);
                  }
                }}
              >
                <div style={getStepStyles(index)}>
                  {completedSteps.has(index) ? 'check' : step.icon || index + 1}
                </div>
                <div style={styles.stepLabel as any}>
                  <div
                    style={{
                      fontWeight: index === currentStep ? 600 : 400,
                      color: index === currentStep ? 'var(--color-text)' : 'var(--color-text-muted)',
                    }}
                  >
                    {step.title}
                  </div>
                  {step.optional && (
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                      (Optional)
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <div style={styles.content}>{children}</div>
      </div>
    </WizardContext.Provider>
  );
};

// ==================== WIZARD STEP ====================

export const WizardStep: React.FC<WizardStepProps> = ({
  stepId,
  children,
}) => {
  const { currentStep, steps } = useWizard();
  const stepIndex = steps.findIndex((s) => s.id === stepId);

  if (stepIndex !== currentStep) {
    return null;
  }

  return <>{children}</>;
};

// ==================== WIZARD NAVIGATION ====================

interface WizardNavigationProps {
  onValidate?: () => boolean | Promise<boolean>;
  nextLabel?: string;
  prevLabel?: string;
  completeLabel?: string;
  showProgress?: boolean;
}

export const WizardNavigation: React.FC<WizardNavigationProps> = ({
  onValidate,
  nextLabel = 'Next',
  prevLabel = 'Back',
  completeLabel = 'Complete',
  showProgress = true,
}) => {
  const { currentStep, steps, isFirstStep, isLastStep, nextStep, prevStep } = useWizard();
  const [isValidating, setIsValidating] = useState(false);

  const handleNext = async () => {
    if (onValidate) {
      setIsValidating(true);
      try {
        const isValid = await onValidate();
        if (isValid) {
          nextStep();
        }
      } finally {
        setIsValidating(false);
      }
    } else {
      nextStep();
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 24,
      paddingTop: 24,
      borderTop: '1px solid var(--color-border)',
    },
    progress: {
      fontSize: 13,
      color: 'var(--color-text-muted)',
    },
    buttons: {
      display: 'flex',
      gap: 12,
    },
    button: {
      padding: '10px 20px',
      border: 'none',
      borderRadius: 6,
      cursor: 'pointer',
      fontSize: 14,
      fontWeight: 500,
      transition: 'all 0.2s ease',
    },
  };

  return (
    <div style={styles.container}>
      {showProgress && (
        <div style={styles.progress}>
          Step {currentStep + 1} of {steps.length}
        </div>
      )}
      <div style={styles.buttons}>
        {!isFirstStep && (
          <button
            onClick={prevStep}
            style={{
              ...styles.button,
              background: 'var(--color-bg-tertiary)',
              color: 'var(--color-text)',
            }}
          >
            {prevLabel}
          </button>
        )}
        <button
          onClick={handleNext}
          disabled={isValidating}
          style={{
            ...styles.button,
            background: 'var(--color-accent)',
            color: 'white',
            opacity: isValidating ? 0.7 : 1,
          }}
        >
          {isValidating ? 'Validating...' : isLastStep ? completeLabel : nextLabel}
        </button>
      </div>
    </div>
  );
};

// ==================== MULTI-STEP FORM ====================

interface FormStep {
  id: string;
  title: string;
  fields: FormField[];
}

interface FormField {
  name: string;
  label: string;
  type: 'text' | 'email' | 'password' | 'number' | 'textarea' | 'select' | 'checkbox' | 'radio' | 'file';
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  validation?: (value: any) => string | null;
}

interface MultiStepFormProps {
  steps: FormStep[];
  onSubmit: (data: Record<string, any>) => void;
  initialData?: Record<string, any>;
}

export const MultiStepForm: React.FC<MultiStepFormProps> = ({
  steps,
  onSubmit,
  initialData = {},
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<Record<string, any>>(initialData);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateStep = (): boolean => {
    const step = steps[currentStep];
    const newErrors: Record<string, string> = {};

    step.fields.forEach((field) => {
      const value = formData[field.name];

      if (field.required && !value) {
        newErrors[field.name] = `${field.label} is required`;
      } else if (field.validation) {
        const error = field.validation(value);
        if (error) {
          newErrors[field.name] = error;
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep()) {
      if (currentStep < steps.length - 1) {
        setCurrentStep(currentStep + 1);
      } else {
        onSubmit(formData);
      }
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleChange = (name: string, value: any) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => {
        const { [name]: _, ...rest } = prev;
        return rest;
      });
    }
  };

  const renderField = (field: FormField) => {
    const value = formData[field.name] ?? '';
    const error = errors[field.name];

    const inputStyle: React.CSSProperties = {
      width: '100%',
      padding: '10px 12px',
      border: error ? '1px solid var(--color-error)' : '1px solid var(--color-border)',
      borderRadius: 6,
      background: 'var(--color-bg)',
      color: 'var(--color-text)',
      fontSize: 14,
    };

    switch (field.type) {
      case 'textarea':
        return (
          <textarea
            value={value}
            onChange={(e) => handleChange(field.name, e.target.value)}
            placeholder={field.placeholder}
            style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }}
          />
        );

      case 'select':
        return (
          <select
            value={value}
            onChange={(e) => handleChange(field.name, e.target.value)}
            style={inputStyle}
          >
            <option value="">{field.placeholder || 'Select...'}</option>
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );

      case 'checkbox':
        return (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={!!value}
              onChange={(e) => handleChange(field.name, e.target.checked)}
            />
            {field.label}
          </label>
        );

      case 'radio':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {field.options?.map((opt) => (
              <label
                key={opt.value}
                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
              >
                <input
                  type="radio"
                  name={field.name}
                  value={opt.value}
                  checked={value === opt.value}
                  onChange={(e) => handleChange(field.name, e.target.value)}
                />
                {opt.label}
              </label>
            ))}
          </div>
        );

      case 'file':
        return (
          <input
            type="file"
            onChange={(e) => handleChange(field.name, e.target.files?.[0])}
            style={inputStyle}
          />
        );

      default:
        return (
          <input
            type={field.type}
            value={value}
            onChange={(e) => handleChange(field.name, e.target.value)}
            placeholder={field.placeholder}
            style={inputStyle}
          />
        );
    }
  };

  const step = steps[currentStep];

  const styles: Record<string, React.CSSProperties> = {
    container: {
      maxWidth: 600,
      margin: '0 auto',
    },
    header: {
      marginBottom: 24,
    },
    progress: {
      display: 'flex',
      gap: 4,
      marginBottom: 12,
    },
    progressBar: {
      flex: 1,
      height: 4,
      borderRadius: 2,
    },
    title: {
      fontSize: 20,
      fontWeight: 600,
      color: 'var(--color-text)',
      margin: 0,
    },
    subtitle: {
      fontSize: 13,
      color: 'var(--color-text-muted)',
      marginTop: 4,
    },
    form: {
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
    },
    field: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    },
    label: {
      fontSize: 14,
      fontWeight: 500,
      color: 'var(--color-text)',
    },
    required: {
      color: 'var(--color-error)',
    },
    error: {
      fontSize: 12,
      color: 'var(--color-error)',
      marginTop: 4,
    },
    buttons: {
      display: 'flex',
      justifyContent: 'space-between',
      marginTop: 32,
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.progress}>
          {steps.map((_, index) => (
            <div
              key={index}
              style={{
                ...styles.progressBar,
                background: index <= currentStep
                  ? 'var(--color-accent)'
                  : 'var(--color-border)',
              }}
            />
          ))}
        </div>
        <h2 style={styles.title}>{step.title}</h2>
        <p style={styles.subtitle}>Step {currentStep + 1} of {steps.length}</p>
      </div>

      <div style={styles.form as any}>
        {step.fields.map((field) => (
          <div key={field.name} style={styles.field as any}>
            {field.type !== 'checkbox' && (
              <label style={styles.label}>
                {field.label}
                {field.required && <span style={styles.required}> *</span>}
              </label>
            )}
            {renderField(field)}
            {errors[field.name] && <span style={styles.error}>{errors[field.name]}</span>}
          </div>
        ))}
      </div>

      <div style={styles.buttons}>
        <button
          onClick={handlePrev}
          disabled={currentStep === 0}
          style={{
            padding: '10px 20px',
            border: '1px solid var(--color-border)',
            borderRadius: 6,
            background: 'transparent',
            color: 'var(--color-text)',
            cursor: currentStep === 0 ? 'not-allowed' : 'pointer',
            opacity: currentStep === 0 ? 0.5 : 1,
            fontSize: 14,
          }}
        >
          Back
        </button>
        <button
          onClick={handleNext}
          style={{
            padding: '10px 20px',
            border: 'none',
            borderRadius: 6,
            background: 'var(--color-accent)',
            color: 'white',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          {currentStep === steps.length - 1 ? 'Submit' : 'Continue'}
        </button>
      </div>
    </div>
  );
};

export default Wizard;
