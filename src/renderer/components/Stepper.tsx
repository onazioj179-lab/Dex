/**
 * DEX Step/Wizard Component
 * Multi-step forms and wizards
 */

import React, { useState, useCallback, createContext, useContext } from 'react';

// ==================== TYPES ====================

interface Step {
  id: string;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  optional?: boolean;
  completed?: boolean;
  disabled?: boolean;
}

interface StepperProps {
  steps: Step[];
  currentStep: number;
  onStepClick?: (stepIndex: number) => void;
  orientation?: 'horizontal' | 'vertical';
  variant?: 'default' | 'compact' | 'dots';
  showNumbers?: boolean;
  clickable?: boolean;
}

interface WizardProps {
  children: React.ReactNode;
  initialStep?: number;
  onComplete?: () => void;
  onCancel?: () => void;
  showProgress?: boolean;
  allowSkip?: boolean;
}

interface WizardStepProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  optional?: boolean;
  children: React.ReactNode;
  validation?: () => boolean | Promise<boolean>;
}

interface WizardContextType {
  currentStep: number;
  totalSteps: number;
  goToStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
}

// ==================== CONTEXT ====================

const WizardContext = createContext<WizardContextType | undefined>(undefined);

export const useWizard = () => {
  const context = useContext(WizardContext);
  if (!context) {
    throw new Error('useWizard must be used within a Wizard');
  }
  return context;
};

// ==================== STEPPER ====================

export const Stepper: React.FC<StepperProps> = ({
  steps,
  currentStep,
  onStepClick,
  orientation = 'horizontal',
  variant = 'default',
  showNumbers = true,
  clickable = true,
}) => {
  const isHorizontal = orientation === 'horizontal';

  const getStepStatus = (index: number): 'completed' | 'current' | 'upcoming' => {
    if (steps[index]?.completed || index < currentStep) return 'completed';
    if (index === currentStep) return 'current';
    return 'upcoming';
  };

  const handleStepClick = (index: number) => {
    if (!clickable || steps[index]?.disabled) return;
    onStepClick?.(index);
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: isHorizontal ? 'row' : 'column',
      gap: isHorizontal ? 0 : 16,
    },
    step: {
      display: 'flex',
      flexDirection: isHorizontal ? 'column' : 'row',
      alignItems: 'center',
      gap: isHorizontal ? 8 : 16,
      flex: isHorizontal ? 1 : undefined,
      position: 'relative',
    },
    indicator: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: variant === 'dots' ? 12 : variant === 'compact' ? 24 : 32,
      height: variant === 'dots' ? 12 : variant === 'compact' ? 24 : 32,
      borderRadius: '50%',
      fontSize: variant === 'compact' ? 11 : 13,
      fontWeight: 600,
      transition: 'all 0.2s',
      cursor: clickable ? 'pointer' : 'default',
      zIndex: 1,
    },
    indicatorCompleted: {
      background: 'var(--color-accent)',
      color: '#fff',
    },
    indicatorCurrent: {
      background: 'var(--color-accent)',
      color: '#fff',
      boxShadow: '0 0 0 4px rgba(var(--color-accent-rgb), 0.2)',
    },
    indicatorUpcoming: {
      background: 'var(--color-bg-tertiary)',
      color: 'var(--color-text-muted)',
    },
    indicatorDisabled: {
      opacity: 0.5,
      cursor: 'not-allowed',
    },
    content: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: isHorizontal ? 'center' : 'flex-start',
      textAlign: isHorizontal ? 'center' : 'left',
    },
    title: {
      fontSize: 13,
      fontWeight: 500,
      color: 'var(--color-text)',
      margin: 0,
    },
    titleMuted: {
      color: 'var(--color-text-muted)',
    },
    description: {
      fontSize: 11,
      color: 'var(--color-text-muted)',
      margin: 0,
      marginTop: 2,
    },
    optional: {
      fontSize: 10,
      color: 'var(--color-text-muted)',
      fontStyle: 'italic',
    },
    connector: {
      position: 'absolute',
      background: 'var(--color-border)',
      ...(isHorizontal
        ? {
            top: variant === 'dots' ? 6 : variant === 'compact' ? 12 : 16,
            left: '50%',
            right: '-50%',
            height: 2,
          }
        : {
            left: variant === 'dots' ? 6 : variant === 'compact' ? 12 : 16,
            top: variant === 'dots' ? 12 : variant === 'compact' ? 24 : 32,
            bottom: -16,
            width: 2,
          }),
    },
    connectorCompleted: {
      background: 'var(--color-accent)',
    },
  };

  if (variant === 'dots') {
    return (
      <div style={{ ...styles.container, gap: 8 }}>
        {steps.map((step, index) => {
          const status = getStepStatus(index);
          return (
            <div
              key={step.id}
              style={{
                ...styles.indicator,
                ...(status === 'completed' ? styles.indicatorCompleted : {}),
                ...(status === 'current' ? styles.indicatorCurrent : {}),
                ...(status === 'upcoming' ? styles.indicatorUpcoming : {}),
                ...(step.disabled ? styles.indicatorDisabled : {}),
              }}
              onClick={() => handleStepClick(index)}
              title={step.title}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {steps.map((step, index) => {
        const status = getStepStatus(index);
        const isLast = index === steps.length - 1;

        return (
          <div key={step.id} style={styles.step}>
            <div
              style={{
                ...styles.indicator,
                ...(status === 'completed' ? styles.indicatorCompleted : {}),
                ...(status === 'current' ? styles.indicatorCurrent : {}),
                ...(status === 'upcoming' ? styles.indicatorUpcoming : {}),
                ...(step.disabled ? styles.indicatorDisabled : {}),
              }}
              onClick={() => handleStepClick(index)}
            >
              {status === 'completed' ? (
                'check'
              ) : step.icon ? (
                step.icon
              ) : showNumbers ? (
                index + 1
              ) : null}
            </div>

            {variant !== 'compact' && (
              <div style={styles.content}>
                <p
                  style={{
                    ...styles.title,
                    ...(status === 'upcoming' ? styles.titleMuted : {}),
                  }}
                >
                  {step.title}
                </p>
                {step.description && (
                  <p style={styles.description}>{step.description}</p>
                )}
                {step.optional && (
                  <span style={styles.optional}>Optional</span>
                )}
              </div>
            )}

            {!isLast && (
              <div
                style={{
                  ...styles.connector,
                  ...(status === 'completed' ? styles.connectorCompleted : {}),
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

// ==================== WIZARD ====================

export const Wizard: React.FC<WizardProps> = ({
  children,
  initialStep = 0,
  onComplete,
  onCancel,
  showProgress = true,
  allowSkip = false,
}) => {
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [isValidating, setIsValidating] = useState(false);

  const steps = React.Children.toArray(children) as React.ReactElement<WizardStepProps>[];
  const totalSteps = steps.length;
  const currentStepComponent = steps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === totalSteps - 1;

  const goToStep = useCallback((step: number) => {
    if (step >= 0 && step < totalSteps) {
      setCurrentStep(step);
    }
  }, [totalSteps]);

  const nextStep = useCallback(async () => {
    const stepProps = currentStepComponent?.props;

    if (stepProps?.validation) {
      setIsValidating(true);
      try {
        const isValid = await stepProps.validation();
        if (!isValid) {
          setIsValidating(false);
          return;
        }
      } catch {
        setIsValidating(false);
        return;
      }
      setIsValidating(false);
    }

    if (isLastStep) {
      onComplete?.();
    } else {
      setCurrentStep(prev => Math.min(prev + 1, totalSteps - 1));
    }
  }, [currentStepComponent, isLastStep, totalSteps, onComplete]);

  const prevStep = useCallback(() => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  }, []);

  const stepData: Step[] = steps.map((step, index) => ({
    id: `step-${index}`,
    title: step.props.title,
    description: step.props.description,
    icon: step.props.icon,
    optional: step.props.optional,
    completed: index < currentStep,
  }));

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
    },
    header: {
      padding: 24,
      borderBottom: '1px solid var(--color-border)',
    },
    progress: {
      height: 4,
      background: 'var(--color-bg-tertiary)',
      borderRadius: 2,
      overflow: 'hidden',
      marginTop: 16,
    },
    progressBar: {
      height: '100%',
      background: 'var(--color-accent)',
      transition: 'width 0.3s ease',
      width: `${((currentStep + 1) / totalSteps) * 100}%`,
    },
    content: {
      flex: 1,
      padding: 24,
      overflow: 'auto',
    },
    footer: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
      borderTop: '1px solid var(--color-border)',
    },
    footerLeft: {
      display: 'flex',
      gap: 8,
    },
    footerRight: {
      display: 'flex',
      gap: 8,
    },
    button: {
      padding: '10px 20px',
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      fontSize: 14,
      fontWeight: 500,
      color: 'var(--color-text)',
      cursor: 'pointer',
      transition: 'all 0.15s',
    },
    buttonPrimary: {
      background: 'var(--color-accent)',
      borderColor: 'var(--color-accent)',
      color: '#fff',
    },
    buttonDisabled: {
      opacity: 0.5,
      cursor: 'not-allowed',
    },
    stepInfo: {
      fontSize: 13,
      color: 'var(--color-text-muted)',
    },
  };

  return (
    <WizardContext.Provider
      value={{
        currentStep,
        totalSteps,
        goToStep,
        nextStep,
        prevStep,
        isFirstStep,
        isLastStep,
      }}
    >
      <div style={styles.container}>
        <div style={styles.header}>
          <Stepper
            steps={stepData}
            currentStep={currentStep}
            onStepClick={goToStep}
            clickable
          />
          {showProgress && (
            <div style={styles.progress}>
              <div style={styles.progressBar} />
            </div>
          )}
        </div>

        <div style={styles.content}>
          {currentStepComponent}
        </div>

        <div style={styles.footer}>
          <div style={styles.footerLeft}>
            {onCancel && (
              <button style={styles.button} onClick={onCancel}>
                Cancel
              </button>
            )}
          </div>

          <span style={styles.stepInfo}>
            Step {currentStep + 1} of {totalSteps}
          </span>

          <div style={styles.footerRight}>
            {!isFirstStep && (
              <button style={styles.button} onClick={prevStep}>
                Back
              </button>
            )}
            {allowSkip && currentStepComponent?.props?.optional && !isLastStep && (
              <button style={styles.button} onClick={() => goToStep(currentStep + 1)}>
                Skip
              </button>
            )}
            <button
              style={{
                ...styles.button,
                ...styles.buttonPrimary,
                ...(isValidating ? styles.buttonDisabled : {}),
              }}
              onClick={nextStep}
              disabled={isValidating}
            >
              {isValidating ? 'Validating...' : isLastStep ? 'Complete' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </WizardContext.Provider>
  );
};

// ==================== WIZARD STEP ====================

export const WizardStep: React.FC<WizardStepProps> = ({ children }) => {
  return <>{children}</>;
};

// ==================== TIMELINE STEPPER ====================

interface TimelineStepperProps {
  steps: (Step & { date?: Date; status?: 'success' | 'error' | 'warning' | 'pending' })[];
  showDates?: boolean;
}

export const TimelineStepper: React.FC<TimelineStepperProps> = ({
  steps,
  showDates = true,
}) => {
  const getStatusColor = (status?: string): string => {
    switch (status) {
      case 'success': return '#10b981';
      case 'error': return '#ef4444';
      case 'warning': return '#f59e0b';
      case 'pending': return 'var(--color-text-muted)';
      default: return 'var(--color-accent)';
    }
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
    },
    step: {
      display: 'flex',
      gap: 16,
      position: 'relative',
      paddingBottom: 24,
    },
    indicator: {
      width: 12,
      height: 12,
      borderRadius: '50%',
      flexShrink: 0,
      marginTop: 4,
      zIndex: 1,
    },
    connector: {
      position: 'absolute',
      left: 5,
      top: 16,
      bottom: 0,
      width: 2,
      background: 'var(--color-border)',
    },
    content: {
      flex: 1,
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    title: {
      fontSize: 14,
      fontWeight: 500,
      color: 'var(--color-text)',
      margin: 0,
    },
    date: {
      fontSize: 11,
      color: 'var(--color-text-muted)',
    },
    description: {
      fontSize: 13,
      color: 'var(--color-text-secondary)',
      margin: '4px 0 0 0',
    },
  };

  return (
    <div style={styles.container}>
      {steps.map((step, index) => (
        <div key={step.id} style={styles.step}>
          <div
            style={{
              ...styles.indicator,
              background: getStatusColor(step.status),
            }}
          />
          {index < steps.length - 1 && <div style={styles.connector} />}
          <div style={styles.content}>
            <div style={styles.header}>
              <h4 style={styles.title}>{step.title}</h4>
              {showDates && step.date && (
                <span style={styles.date}>{formatDate(step.date)}</span>
              )}
            </div>
            {step.description && (
              <p style={styles.description}>{step.description}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

// ==================== USE STEPS HOOK ====================

export const useSteps = (totalSteps: number, initialStep = 0) => {
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === totalSteps - 1;

  const goToStep = (step: number) => {
    if (step >= 0 && step < totalSteps) {
      setCurrentStep(step);
    }
  };

  const nextStep = () => {
    setCompletedSteps(prev => new Set([...prev, currentStep]));
    goToStep(currentStep + 1);
  };

  const prevStep = () => {
    goToStep(currentStep - 1);
  };

  const reset = () => {
    setCurrentStep(initialStep);
    setCompletedSteps(new Set());
  };

  const markCompleted = (step: number) => {
    setCompletedSteps(prev => new Set([...prev, step]));
  };

  const isCompleted = (step: number) => completedSteps.has(step);

  return {
    currentStep,
    totalSteps,
    goToStep,
    nextStep,
    prevStep,
    isFirstStep,
    isLastStep,
    completedSteps,
    markCompleted,
    isCompleted,
    reset,
  };
};

export default Stepper;
