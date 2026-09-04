#include <node_api.h>
#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>

static napi_value NapiBoolean(napi_env env, bool value) {
    napi_value result;
    napi_get_boolean(env, value, &result);
    return result;
}

static bool NumberProperty(
    napi_env env,
    napi_value object,
    const char* name,
    double* result
) {
    napi_value value;
    return napi_get_named_property(env, object, name, &value) == napi_ok &&
        napi_get_value_double(env, value, result) == napi_ok;
}

static napi_value RequestAccessibility(napi_env env, napi_callback_info info) {
    NSDictionary* options = @{
        (__bridge NSString*)kAXTrustedCheckOptionPrompt: @YES,
    };
    return NapiBoolean(env, AXIsProcessTrustedWithOptions(
        (__bridge CFDictionaryRef)options
    ));
}

static AXUIElementRef FocusedWindow(pid_t pid) {
    AXUIElementRef application = AXUIElementCreateApplication(pid);
    CFTypeRef window = nullptr;
    AXError error = AXUIElementCopyAttributeValue(
        application,
        kAXFocusedWindowAttribute,
        &window
    );
    CFRelease(application);
    return error == kAXErrorSuccess ? (AXUIElementRef)window : nullptr;
}

static AXUIElementRef FrontmostExternalWindow(pid_t* pid) {
    NSArray* windows = CFBridgingRelease(CGWindowListCopyWindowInfo(
        kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
        kCGNullWindowID
    ));

    for (NSDictionary* info in windows) {
        NSNumber* ownerPid = info[(__bridge NSString*)kCGWindowOwnerPID];
        NSNumber* layer = info[(__bridge NSString*)kCGWindowLayer];
        if (!ownerPid || ownerPid.intValue == getpid() || layer.intValue != 0) {
            continue;
        }

        AXUIElementRef window = FocusedWindow(ownerPid.intValue);
        if (window) {
            *pid = ownerPid.intValue;
            return window;
        }
    }

    return nullptr;
}

static napi_value GetActiveWindow(napi_env env, napi_callback_info info) {
    pid_t pid = 0;
    AXUIElementRef window = FrontmostExternalWindow(&pid);
    if (!window) {
        napi_throw_error(env, nullptr, "Не найдено активное внешнее окно");
        return nullptr;
    }

    CFTypeRef positionValue = nullptr;
    CFTypeRef sizeValue = nullptr;
    CGPoint position;
    CGSize size;
    bool valid =
        AXUIElementCopyAttributeValue(window, kAXPositionAttribute, &positionValue) == kAXErrorSuccess &&
        AXUIElementCopyAttributeValue(window, kAXSizeAttribute, &sizeValue) == kAXErrorSuccess &&
        AXValueGetValue((AXValueRef)positionValue, (AXValueType)kAXValueCGPointType, &position) &&
        AXValueGetValue((AXValueRef)sizeValue, (AXValueType)kAXValueCGSizeType, &size);
    if (positionValue) {
        CFRelease(positionValue);
    }
    if (sizeValue) {
        CFRelease(sizeValue);
    }
    CFRelease(window);

    if (!valid) {
        napi_throw_error(env, nullptr, "Не удалось получить координаты окна");
        return nullptr;
    }

    napi_value result;
    napi_create_object(env, &result);
    napi_value value;
    napi_create_int32(env, pid, &value);
    napi_set_named_property(env, result, "pid", value);
    napi_create_double(env, position.x, &value);
    napi_set_named_property(env, result, "x", value);
    napi_create_double(env, position.y, &value);
    napi_set_named_property(env, result, "y", value);
    napi_create_double(env, size.width, &value);
    napi_set_named_property(env, result, "width", value);
    napi_create_double(env, size.height, &value);
    napi_set_named_property(env, result, "height", value);
    return result;
}

static napi_value SetWindowBounds(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value args[1];
    napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
    double pidValue, x, y, width, height;
    if (argc != 1 ||
        !NumberProperty(env, args[0], "pid", &pidValue) ||
        !NumberProperty(env, args[0], "x", &x) ||
        !NumberProperty(env, args[0], "y", &y) ||
        !NumberProperty(env, args[0], "width", &width) ||
        !NumberProperty(env, args[0], "height", &height)) {
        napi_throw_type_error(env, nullptr, "Ожидались координаты окна");
        return nullptr;
    }

    AXUIElementRef window = FocusedWindow((pid_t)pidValue);
    if (!window) {
        napi_throw_error(env, nullptr, "Окно больше недоступно");
        return nullptr;
    }

    CGPoint position = CGPointMake(x, y);
    CGSize size = CGSizeMake(width, height);
    AXValueRef positionValue = AXValueCreate((AXValueType)kAXValueCGPointType, &position);
    AXValueRef sizeValue = AXValueCreate((AXValueType)kAXValueCGSizeType, &size);
    AXError positionError = AXUIElementSetAttributeValue(
        window,
        kAXPositionAttribute,
        positionValue
    );
    AXError sizeError = AXUIElementSetAttributeValue(
        window,
        kAXSizeAttribute,
        sizeValue
    );
    CFRelease(positionValue);
    CFRelease(sizeValue);
    CFRelease(window);

    if (positionError != kAXErrorSuccess || sizeError != kAXErrorSuccess) {
        napi_throw_error(env, nullptr, "Приложение не разрешило изменить окно");
        return nullptr;
    }
    return NapiBoolean(env, true);
}

static napi_value Init(napi_env env, napi_value exports) {
    napi_property_descriptor properties[] = {
        {"requestAccessibility", nullptr, RequestAccessibility, nullptr, nullptr, nullptr, napi_default, nullptr},
        {"getActiveWindow", nullptr, GetActiveWindow, nullptr, nullptr, nullptr, napi_default, nullptr},
        {"setWindowBounds", nullptr, SetWindowBounds, nullptr, nullptr, nullptr, napi_default, nullptr},
    };
    napi_define_properties(env, exports, 3, properties);
    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
